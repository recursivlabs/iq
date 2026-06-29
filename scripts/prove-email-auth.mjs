#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

function redactEmail(email) {
  const [, domain = 'redacted'] = String(email).split('@');
  return `<redacted>@${domain}`;
}

function cookieHeader(setCookie) {
  return setCookie
    .split(/,(?=[^;,]+=)/g)
    .map((value) => value.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
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

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
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

function extractOtp(message) {
  const haystack = [
    message?.subject,
    message?.text,
    message?.html,
  ].filter(Boolean).join('\n');
  const subjectMatch = String(message?.subject || '').match(/\b(\d{6})\b/);
  const anyMatch = haystack.match(/\b(\d{6})\b/);
  return subjectMatch?.[1] || anyMatch?.[1] || '';
}

async function waitForOtpEmail({ resendApiKey, recipient, minCreatedAt, timeoutMs, pollMs }) {
  const started = Date.now();
  let lastSeen = [];
  while (Date.now() - started < timeoutMs) {
    const list = await resendRequest(resendApiKey, '/emails?limit=100');
    const candidates = sentEmailRows(list)
      .filter((email) => sentTo(email, recipient))
      .filter((email) => /verification code/i.test(String(email.subject || '')))
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
      const otp = extractOtp(full);
      if (otp) {
        return { email: full, otp };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  fail('Timed out waiting for IQ WARS OTP email in Resend sent-email list.', {
    recipient: redactEmail(recipient),
    lastSeen,
  });
}

async function sendOtp(origin, email) {
  const { response, data } = await requestJson(`${origin}/api/recursiv-auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert(response.ok && data?.sent === true && data?.branded === true, 'IQ WARS send-code did not return branded success.', {
    status: response.status,
    data,
  });
}

async function verifyOtp(origin, email, otp, playerId) {
  const { response, data } = await requestJson(`${origin}/api/recursiv-auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: otp, playerId }),
  });
  const setCookie = response.headers.get('set-cookie') || '';
  assert(response.ok && data?.verified === true, 'IQ WARS verify-code did not verify the OTP.', {
    status: response.status,
    data: { ...data, keyPrefix: data?.keyPrefix ? '<present>' : data?.keyPrefix },
  });
  assert(data?.projectMember === true, 'Verified account was not marked as an IQ WARS project member.', {
    data: { ...data, keyPrefix: data?.keyPrefix ? '<present>' : data?.keyPrefix },
  });
  assert(typeof data?.playerId === 'string' && data.playerId.length > 0, 'Verify-code did not return a linked playerId.', {
    data,
  });
  assert(setCookie.includes('iqwars_player_api_key='), 'Verify-code did not set the IQ WARS player API key cookie.');
  return { data, cookie: cookieHeader(setCookie) };
}

async function proveProfileWrite(origin, cookie, playerId, nonce) {
  const slug = `emailproof${nonce}`.slice(0, 32);
  const profile = {
    id: playerId,
    slug,
    username: slug,
    displayName: 'IQ WARS Email Proof',
    bio: 'Controlled production email-auth proof account.',
    city: 'New York',
    country: 'United States',
    score: 128,
    best: 128,
    rank: '#54,100',
    attempts: 1,
    answers: 12,
    profilePublic: true,
    showLocation: false,
    showXBadge: false,
    showHistory: true,
  };
  const saved = await requestJson(`${origin}/api/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(profile),
  });
  assert(saved.response.ok && saved.data?.profile?.slug === slug, 'Authenticated profile write failed after email-code verification.', {
    status: saved.response.status,
    data: saved.data,
  });
  const read = await requestJson(`${origin}/api/profiles?slug=${encodeURIComponent(slug)}`, {
    headers: { Cookie: cookie },
  });
  assert(read.response.ok && read.data?.profile?.id === playerId, 'Authenticated profile readback failed after email-code verification.', {
    status: read.response.status,
    data: read.data,
  });
  return { slug };
}

async function otpRound({ origin, resendApiKey, email, requestedPlayerId, timeoutMs, pollMs }) {
  const minCreatedAt = Date.now();
  await sendOtp(origin, email);
  const { email: sentEmail, otp } = await waitForOtpEmail({
    resendApiKey,
    recipient: email,
    minCreatedAt,
    timeoutMs,
    pollMs,
  });
  const subject = String(sentEmail.subject || '');
  const text = String(sentEmail.text || '');
  const html = String(sentEmail.html || '');
  assert(/IQ WARS/i.test(subject), 'OTP email subject was not branded for IQ WARS.', {
    subject: subject.replace(/\d{6}/g, '<otp>'),
  });
  assert(/IQ WARS/i.test(`${text}\n${html}`), 'OTP email body was not branded for IQ WARS.');
  assert(/Powered by Recursiv/i.test(`${text}\n${html}`), 'OTP email body did not identify Recursiv platform branding.');
  const verified = await verifyOtp(origin, email, otp, requestedPlayerId);
  return {
    sentEmail: {
      id: sentEmail.id,
      lastEvent: sentEmail.last_event || sentEmail.lastEvent || null,
      subject: subject.replace(/\d{6}/g, '<otp>'),
    },
    verified,
  };
}

async function main() {
  const dotenvPath = valueAfter('--dotenv') || process.env.IQWARS_LOCAL_DOTENV || '/Users/billottman/dev/recursiv/.env';
  const localEnv = { ...loadDotenv(dotenvPath), ...process.env };
  const origin = String(valueAfter('--origin') || process.env.IQWARS_AUDIT_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
  const resendApiKey = valueAfter('--resend-api-key') || localEnv.RESEND_API_KEY || '';
  const timeoutMs = Number(valueAfter('--timeout-ms') || 90_000);
  const pollMs = Number(valueAfter('--poll-ms') || 3_000);

  assert(resendApiKey, 'Missing RESEND_API_KEY for sent-email proof. Set RESEND_API_KEY or pass --resend-api-key.');

  const fallbackDomain = String(localEnv.E2E_NEW_USER_EMAIL || 'iqwars.local.social.dev').split('@').pop() || 'local.social.dev';
  const nonce = randomUUID().replace(/-/g, '').slice(0, 12);
  const email = valueAfter('--email') || `iqwars-proof-${nonce}@${fallbackDomain}`;
  const firstPlayerId = `email-proof-${nonce}-a`;
  const secondRequestedPlayerId = `email-proof-${nonce}-b`;

  const first = await otpRound({
    origin,
    resendApiKey,
    email,
    requestedPlayerId: firstPlayerId,
    timeoutMs,
    pollMs,
  });
  assert(first.verified.data.playerId === firstPlayerId, 'First email-code verification did not preserve the requested playerId.', {
    expected: firstPlayerId,
    actual: first.verified.data.playerId,
  });

  const profile = await proveProfileWrite(origin, first.verified.cookie, first.verified.data.playerId, nonce);

  const second = await otpRound({
    origin,
    resendApiKey,
    email,
    requestedPlayerId: secondRequestedPlayerId,
    timeoutMs,
    pollMs,
  });
  assert(second.verified.data.playerId === firstPlayerId, 'Second email-code verification did not return the stable linked playerId.', {
    expected: firstPlayerId,
    actual: second.verified.data.playerId,
  });

  console.log(`PASS IQ WARS email-code proof passed for ${redactEmail(email)}`);
  console.log(JSON.stringify({
    origin,
    recipient: redactEmail(email),
    firstEmail: first.sentEmail,
    secondEmail: second.sentEmail,
    linkedPlayerIdStable: true,
    projectMember: true,
    playerCookieSet: true,
    profileSlug: profile.slug,
  }, null, 2));
}

main().catch((error) => {
  const details = error?.details ? ` ${JSON.stringify(error.details)}` : '';
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
