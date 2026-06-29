#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadDotenv(file) {
  const env = {};
  if (!file || !existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

function redactEmail(email) {
  const [, domain = 'redacted'] = String(email).split('@');
  return `<redacted>@${domain}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date);
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function loadCoolifyEnv(localEnv) {
  const coolifyApi = String(valueAfter('--coolify-api-url') || localEnv.COOLIFY_API_URL || '').replace(/\/+$/, '');
  const coolifyToken = valueAfter('--coolify-token') || localEnv.COOLIFY_API_TOKEN || '';
  const appUuid = valueAfter('--app-uuid') || localEnv.IQWARS_COOLIFY_APP_UUID || localEnv.COOLIFY_APP_UUID || 'nu38x7705v0z961mpbighllf';
  if (!coolifyApi || !coolifyToken || hasFlag('--no-coolify')) return {};
  const response = await fetch(`${coolifyApi}/applications/${appUuid}/envs`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${coolifyToken}`,
    },
  });
  if (!response.ok) fail('Coolify env fetch failed.', { status: response.status });
  const data = await response.json();
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.envs) ? data.envs : [];
  const env = {};
  for (const row of rows) {
    const key = row.key || row.name;
    const value = row.value ?? row.real_value ?? row.realValue ?? row.plainValue;
    if (typeof key === 'string' && typeof value === 'string' && value) env[key] = value;
  }
  return env;
}

async function resendRequest(apiKey, path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    fail(`Resend request failed: GET ${path}`, {
      status: response.status,
      message: data?.message || data?.error || 'unknown',
    });
  }
  return data;
}

function sentEmailRows(data) {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.emails)) return data.emails;
  if (Array.isArray(data)) return data;
  return [];
}

function emailCreatedAt(email) {
  const timestamp = Date.parse(email?.created_at || email?.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sentTo(email, target) {
  const recipients = Array.isArray(email?.to) ? email.to : [email?.to].filter(Boolean);
  return recipients.map((value) => String(value).toLowerCase()).includes(target.toLowerCase());
}

async function waitForSentEmail({ resendApiKey, recipient, minCreatedAt, subjectPattern, timeoutMs, pollMs }) {
  const started = Date.now();
  let lastSeen = [];
  while (Date.now() - started < timeoutMs) {
    const list = await resendRequest(resendApiKey, '/emails?limit=100');
    const candidates = sentEmailRows(list)
      .filter((email) => sentTo(email, recipient))
      .filter((email) => subjectPattern.test(String(email.subject || '')))
      .filter((email) => emailCreatedAt(email) >= minCreatedAt - 30_000)
      .sort((a, b) => emailCreatedAt(b) - emailCreatedAt(a));
    lastSeen = candidates.map((email) => ({
      id: email.id,
      subject: String(email.subject || '').replace(/\d{6}/g, '<otp>'),
      last_event: email.last_event || email.lastEvent || null,
      created_at: email.created_at || email.createdAt || null,
    }));
    const candidate = candidates[0];
    if (candidate?.id) {
      const full = await resendRequest(resendApiKey, `/emails/${encodeURIComponent(candidate.id)}`);
      return full;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  fail('Timed out waiting for sent reminder email in Resend.', {
    recipient: redactEmail(recipient),
    lastSeen,
  });
}

async function seedYesterdayScore(origin, { day, playerId, groupCode, groupName }) {
  const response = await requestJson(`${origin}/api/leaderboards?agents=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId,
      displayName: 'Reminder Proof',
      username: 'reminder_proof',
      groupCode,
      groupName,
      correct: 10,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
      geo: {
        country: 'United States',
        countryCode: 'US',
        city: 'New York',
        town: 'New York',
        timeZone: 'America/New_York',
        source: 'reminder-proof',
      },
    }),
  });
  assert(response.response.ok && response.data?.entry?.playerId === playerId, 'Failed to seed proof leaderboard score.', {
    status: response.response.status,
    data: response.data,
  });
}

async function saveReminder(origin, { email, playerId, groupCode, groupName }) {
  const response = await requestJson(`${origin}/api/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, playerId, groupCode, groupName }),
  });
  assert(response.response.ok && response.data?.ok === true, 'Failed to save proof reminder.', {
    status: response.response.status,
    data: response.data,
  });
  return response.data;
}

async function triggerReminder(origin, cronToken, email) {
  const response = await requestJson(`${origin}/api/reminders/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronToken}`,
    },
    body: JSON.stringify({ email }),
  });
  assert(response.response.ok && response.data?.ok === true, 'Reminder cron proof request failed.', {
    status: response.response.status,
    data: response.data,
  });
  assert(response.data.sent === 1, 'Reminder cron did not send exactly one controlled proof email.', {
    data: response.data,
  });
  return response.data;
}

async function main() {
  const dotenvPath = valueAfter('--dotenv') || process.env.IQWARS_LOCAL_DOTENV || '/Users/billottman/dev/recursiv/.env';
  const baseEnv = { ...loadDotenv(dotenvPath), ...process.env };
  const coolifyEnv = await loadCoolifyEnv(baseEnv);
  const env = { ...coolifyEnv, ...baseEnv };
  const origin = String(valueAfter('--origin') || process.env.IQWARS_AUDIT_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
  const resendApiKey = valueAfter('--resend-api-key') || env.RESEND_API_KEY || '';
  const cronToken = valueAfter('--cron-token') || env.IQ_REMINDER_CRON_TOKEN || '';
  const timeoutMs = Number(valueAfter('--timeout-ms') || 90_000);
  const pollMs = Number(valueAfter('--poll-ms') || 3_000);

  assert(resendApiKey, 'Missing RESEND_API_KEY for reminder sent-email proof.');
  assert(cronToken, 'Missing IQ_REMINDER_CRON_TOKEN for reminder cron proof.');

  const fallbackDomain = String(env.E2E_NEW_USER_EMAIL || 'iqwars.local.social.dev').split('@').pop() || 'local.social.dev';
  const nonce = randomUUID().replace(/-/g, '').slice(0, 12);
  const email = valueAfter('--email') || `iqwars-reminder-proof-${nonce}@${fallbackDomain}`;
  const groupCode = `reminder-${nonce}`;
  const groupName = `Reminder Proof ${nonce.slice(0, 6)}`;
  const playerId = `reminder-proof-${nonce}`;
  const today = dayKey();
  const yesterday = addDays(today, -1);

  await seedYesterdayScore(origin, { day: yesterday, playerId, groupCode, groupName });
  const confirmationMinCreatedAt = Date.now();
  const saved = await saveReminder(origin, { email, playerId, groupCode, groupName });
  if (saved.confirmationSent) {
    const confirmation = await waitForSentEmail({
      resendApiKey,
      recipient: email,
      minCreatedAt: confirmationMinCreatedAt,
      subjectPattern: /ready for tomorrow/i,
      timeoutMs,
      pollMs,
    });
    assert(/One official attempt opens each day/i.test(`${confirmation.text || ''}\n${confirmation.html || ''}`), 'Reminder confirmation email does not describe the daily attempt.');
  }

  const reminderMinCreatedAt = Date.now();
  const sent = await triggerReminder(origin, cronToken, email);
  const reminder = await waitForSentEmail({
    resendApiKey,
    recipient: email,
    minCreatedAt: reminderMinCreatedAt,
    subjectPattern: /IQ WARS|streak|today/i,
    timeoutMs,
    pollMs,
  });
  const subject = String(reminder.subject || '');
  const body = `${reminder.text || ''}\n${reminder.html || ''}`;
  assert(/protect your 1-day IQ streak|today's IQ WARS is live|today's IQ board/i.test(subject), 'Reminder subject does not contain daily/streak positioning.', {
    subject,
  });
  assert(/Streak: 1 completed day/i.test(body), 'Reminder body does not include the proof streak.');
  assert(/Personal best: 137 IQ/i.test(body), 'Reminder body does not include the proof personal best.');
  assert(/Room record: Reminder Proof 137 IQ/i.test(body), 'Reminder body does not include the room record.');
  assert(/Play here: .*\/g\/reminder-/i.test(body), 'Reminder body does not include the room play link.');
  assert(/reply STOP|bill@recursiv\.io/i.test(body), 'Reminder body does not include stop/unsubscribe copy.');

  console.log(`PASS IQ WARS reminder email proof passed for ${redactEmail(email)}`);
  console.log(JSON.stringify({
    origin,
    recipient: redactEmail(email),
    confirmationSent: Boolean(saved.confirmationSent),
    reminderSent: sent.sent,
    reminderSkipped: sent.skipped,
    reminderEmail: {
      id: reminder.id,
      subject,
      lastEvent: reminder.last_event || reminder.lastEvent || null,
      createdAt: reminder.created_at || reminder.createdAt || null,
    },
    groupCode,
    seededDay: yesterday,
  }, null, 2));
}

main().catch((error) => {
  const details = error?.details ? ` ${JSON.stringify(error.details)}` : '';
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
