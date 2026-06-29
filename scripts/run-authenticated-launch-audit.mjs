#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

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

function extractSessionToken(response, data) {
  if (typeof data?.session?.token === 'string') return data.session.token;
  if (typeof data?.token === 'string') return data.token;
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.match(/better-auth\.session_token=([^;]+)/)?.[1] || '';
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  return { response, data };
}

function readableError(data, fallback) {
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error?.code === 'string') return data.error.code;
  if (typeof data?.message === 'string') return data.message;
  return fallback;
}

async function loadCoolifyProjectEnv() {
  const dotenvPath = valueAfter('--dotenv') || process.env.IQWARS_LOCAL_DOTENV || '/Users/billottman/dev/recursiv/.env';
  const localEnv = { ...loadDotenv(dotenvPath), ...process.env };
  const coolifyApi = String(valueAfter('--coolify-api-url') || localEnv.COOLIFY_API_URL || '').replace(/\/+$/, '');
  const coolifyToken = valueAfter('--coolify-token') || localEnv.COOLIFY_API_TOKEN || '';
  const appUuid = valueAfter('--app-uuid') || localEnv.IQWARS_COOLIFY_APP_UUID || localEnv.COOLIFY_APP_UUID || 'nu38x7705v0z961mpbighllf';

  if (!coolifyApi || !coolifyToken || hasFlag('--no-coolify')) {
    return {};
  }

  const response = await fetch(`${coolifyApi}/applications/${appUuid}/envs`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${coolifyToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Coolify env fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : Array.isArray(data.envs) ? data.envs : [];
  const env = {};
  for (const row of rows) {
    const key = row.key || row.name;
    const value = row.value ?? row.real_value ?? row.realValue ?? row.plainValue;
    if (typeof key === 'string' && typeof value === 'string' && value) {
      env[key] = value;
    }
  }
  return env;
}

async function createAuditPlayerKey() {
  const coolifyEnv = await loadCoolifyProjectEnv();
  const projectId = valueAfter('--project-id')
    || process.env.IQWARS_RECURSIV_PROJECT_ID
    || process.env.RECURSIV_PROJECT_ID
    || coolifyEnv.IQWARS_RECURSIV_PROJECT_ID
    || coolifyEnv.RECURSIV_PROJECT_ID
    || '';
  const recursivOrigin = String(valueAfter('--recursiv-origin')
    || process.env.RECURSIV_AUTH_ORIGIN
    || coolifyEnv.RECURSIV_AUTH_ORIGIN
    || 'https://api.recursiv.io').replace(/\/+$/, '');

  if (!projectId) {
    throw new Error('Missing IQ WARS project id. Set IQWARS_RECURSIV_PROJECT_ID, pass --project-id, or provide Coolify credentials.');
  }

  const nonce = randomUUID().replace(/-/g, '').slice(0, 16);
  const email = `iqwars-audit-${nonce}@iqwars.app`;
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
      name: 'IQ WARS Audit Player',
    }),
  });
  if (!signup.response.ok) {
    throw new Error(`Recursiv audit signup failed: ${signup.response.status} ${readableError(signup.data, 'signup_failed')}`);
  }

  const sessionToken = extractSessionToken(signup.response, signup.data);
  if (!sessionToken) {
    throw new Error('Recursiv audit signup did not return a session token.');
  }

  const keyResponse = await requestJson(`${recursivOrigin}/api/v1/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://iqwars.app',
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `better-auth.session_token=${sessionToken}`,
    },
    body: JSON.stringify({
      name: 'IQ WARS launch audit player',
      scopes: ['users:read', 'projects:read', 'billing:read', 'billing:write'],
      projectId,
    }),
  });
  if (!keyResponse.response.ok || typeof keyResponse.data?.data?.key !== 'string') {
    throw new Error(`Project-scoped audit key creation failed: ${keyResponse.response.status} ${readableError(keyResponse.data, 'api_key_failed')}`);
  }

  return {
    key: keyResponse.data.data.key,
    prefix: keyResponse.data.data.prefix || null,
  };
}

async function deployedCommit(origin) {
  const response = await requestJson(`${origin}/api/version`);
  const commit = String(response.data?.commit || '');
  if (!response.response.ok || !/^[a-f0-9]{7,40}$/.test(commit)) {
    throw new Error('Could not read deployed IQ WARS commit from /api/version.');
  }
  return commit;
}

async function main() {
  const origin = String(valueAfter('--origin') || process.env.IQWARS_AUDIT_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
  const expectedCommit = valueAfter('--expected-commit') || await deployedCommit(origin);
  const providedKey = process.env.IQWARS_AUDIT_PLAYER_API_KEY || '';
  const auditKey = providedKey ? { key: providedKey, prefix: 'provided' } : await createAuditPlayerKey();

  console.log(`INFO authenticated audit using ${auditKey.prefix === 'provided' ? 'provided audit key' : `new project-scoped key prefix ${auditKey.prefix || '<none>'}`}`);
  const result = spawnSync('node', [
    'scripts/audit-iqwars.mjs',
    '--origin',
    origin,
    '--require-persistent',
    '--expected-commit',
    expectedCommit,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IQWARS_AUDIT_PLAYER_API_KEY: auditKey.key,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
