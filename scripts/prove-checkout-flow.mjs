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

function extractSessionToken(response, data) {
  if (typeof data?.session?.token === 'string') return data.session.token;
  if (typeof data?.token === 'string') return data.token;
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.match(/better-auth\.session_token=([^;]+)/)?.[1] || '';
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

function readableError(data, fallback) {
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error?.code === 'string') return data.error.code;
  if (typeof data?.message === 'string') return data.message;
  return fallback;
}

async function loadCoolifyProjectEnv(localEnv) {
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

async function createAuditPlayerKey({ projectId, recursivOrigin }) {
  const nonce = randomUUID().replace(/-/g, '').slice(0, 16);
  const email = `iqwars-checkout-audit-${nonce}@iqwars.app`;
  const password = `Audit${nonce}Key42!`;
  const signup = await requestJson(`${recursivOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://iqwars.app',
    },
    body: JSON.stringify({
      email,
      password,
      name: 'IQ WARS Checkout Audit',
    }),
  });
  assert(signup.response.ok, 'Recursiv checkout audit signup failed.', {
    status: signup.response.status,
    error: readableError(signup.data, 'signup_failed'),
  });

  const sessionToken = extractSessionToken(signup.response, signup.data);
  assert(sessionToken, 'Recursiv checkout audit signup did not return a session token.');

  const keyResponse = await requestJson(`${recursivOrigin}/api/v1/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://iqwars.app',
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `better-auth.session_token=${sessionToken}`,
    },
    body: JSON.stringify({
      name: 'IQ WARS checkout proof player',
      scopes: ['users:read', 'projects:read', 'billing:read', 'billing:write'],
      projectId,
    }),
  });
  assert(keyResponse.response.ok && typeof keyResponse.data?.data?.key === 'string', 'Project-scoped checkout audit key creation failed.', {
    status: keyResponse.response.status,
    error: readableError(keyResponse.data, 'api_key_failed'),
  });

  return {
    key: keyResponse.data.data.key,
    prefix: keyResponse.data.data.prefix || null,
  };
}

function safeUrlSummary(value) {
  try {
    const parsed = new URL(String(value || ''));
    return {
      protocol: parsed.protocol,
      host: parsed.host,
      origin: parsed.origin,
    };
  } catch {
    return null;
  }
}

async function main() {
  const dotenvPath = valueAfter('--dotenv') || process.env.IQWARS_LOCAL_DOTENV || '/Users/billottman/dev/recursiv/.env';
  const baseEnv = { ...loadDotenv(dotenvPath), ...process.env };
  const coolifyEnv = await loadCoolifyProjectEnv(baseEnv);
  const env = { ...coolifyEnv, ...baseEnv };
  const origin = String(valueAfter('--origin') || process.env.IQWARS_AUDIT_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
  const recursivOrigin = String(valueAfter('--recursiv-origin') || env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/+$/, '');
  const projectId = valueAfter('--project-id') || env.IQWARS_RECURSIV_PROJECT_ID || env.RECURSIV_PROJECT_ID || '';
  const providedKey = valueAfter('--player-api-key') || process.env.IQWARS_AUDIT_PLAYER_API_KEY || '';
  assert(projectId || providedKey, 'Missing IQ WARS project id or provided audit player key.');

  const billingConfig = await requestJson(`${origin}/api/billing/config`);
  assert(billingConfig.response.ok && billingConfig.data?.checkoutReady === true, 'Billing config is not checkout-ready.', {
    status: billingConfig.response.status,
    data: billingConfig.data,
  });
  assert(!Object.prototype.hasOwnProperty.call(billingConfig.data || {}, 'paymentLinkUrl') && !Object.prototype.hasOwnProperty.call(billingConfig.data || {}, 'url'), 'Billing config leaks a checkout URL.');

  const auditKey = providedKey ? { key: providedKey, prefix: 'provided' } : await createAuditPlayerKey({ projectId, recursivOrigin });
  const playerCookie = `iqwars_player_api_key=${auditKey.key}`;
  const maliciousReturnUrl = 'https://evil.example/steal?sub=success&tier=plus';
  const checkout = await requestJson(`${origin}/api/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: playerCookie,
    },
    body: JSON.stringify({
      tier: 'plus',
      returnUrl: maliciousReturnUrl,
    }),
  });
  const checkoutUrl = typeof checkout.data?.url === 'string' ? checkout.data.url : '';
  const checkoutSummary = safeUrlSummary(checkoutUrl);
  assert(checkout.response.ok && checkoutSummary?.protocol === 'https:', 'Checkout did not return a safe HTTPS URL.', {
    status: checkout.response.status,
    provider: checkout.data?.provider || null,
    error: checkout.data?.error || null,
    url: checkoutSummary,
  });
  assert(checkoutSummary.host !== 'evil.example', 'Checkout reflected an unsafe return URL host.');
  assert(['recursiv.io', 'checkout.stripe.com'].some((host) => checkoutSummary.host === host || checkoutSummary.host.endsWith(`.${host}`)), 'Checkout URL is not hosted by Recursiv or Stripe.', {
    url: checkoutSummary,
  });
  assert(checkout.data?.provider === 'payment_link' || checkout.data?.provider === 'app_subscription', 'Checkout response provider is unsupported.', {
    provider: checkout.data?.provider || null,
  });

  const status = await requestJson(`${origin}/api/checkout-status?tier=plus`, {
    headers: {
      Cookie: playerCookie,
    },
  });
  const setCookie = status.response.headers.get('set-cookie') || '';
  assert(status.response.ok && status.data?.active === false, 'Fresh checkout audit player should remain inactive before payment completion.', {
    status: status.response.status,
    data: status.data,
  });
  assert(setCookie.includes('world_iq_paid='), 'Checkout status did not set or clear the paid-access cookie state.');

  console.log('PASS IQ WARS checkout proof passed');
  console.log(JSON.stringify({
    origin,
    auditKey: auditKey.prefix === 'provided' ? 'provided' : 'generated',
    billing: {
      provider: billingConfig.data.provider,
      checkoutReady: billingConfig.data.checkoutReady,
      priceLabel: billingConfig.data.priceLabel,
    },
    checkout: {
      provider: checkout.data.provider,
      tier: checkout.data.tier ?? null,
      fallback: Boolean(checkout.data.fallback),
      url: checkoutSummary,
    },
    checkoutStatus: {
      active: Boolean(status.data.active),
      status: status.data.status || null,
      tier: status.data.tier || null,
      paidCookieStateWritten: setCookie.includes('world_iq_paid='),
    },
  }, null, 2));
}

main().catch((error) => {
  const details = error?.details ? ` ${JSON.stringify(error.details)}` : '';
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
