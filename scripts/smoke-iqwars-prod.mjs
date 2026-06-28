#!/usr/bin/env node

const args = process.argv.slice(2);
const origin = String(valueAfter('--origin') || process.env.IQWARS_SMOKE_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
const timeoutMs = Number(valueAfter('--timeout-ms') || 10_000);
const failures = [];
const passes = [];

const criticalRoutes = [
  { path: '/', snippets: ['IQ WARS', 'Lock answer'] },
  { path: '/rankings', snippets: ['Global board'] },
  { path: '/research', snippets: ['Daily abstract reasoning practice', 'not clinical IQ certification'] },
  { path: '/privacy', snippets: ['IQ WARS Privacy Policy', 'Recursiv Labs'] },
  { path: '/terms', snippets: ['IQ WARS Terms of Service', 'Fair play'] },
];

function valueAfter(flag) {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function pass(message, details = undefined) {
  passes.push({ message, details });
  console.log(`PASS ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

function fail(message, details = undefined) {
  failures.push({ message, details });
  console.error(`FAIL ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

async function request(path, { expectJson = true } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: expectJson ? 'application/json,text/plain;q=0.8,*/*;q=0.5' : 'text/html,text/plain;q=0.8,*/*;q=0.5' },
    });
    const text = await response.text();
    let data = null;
    if (expectJson) {
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        fail(`${path} returns parseable JSON`, { status: response.status, body: text.slice(0, 240) });
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      data,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message, details = undefined) {
  if (condition) pass(message, details);
  else fail(message, details);
}

function assertNoStore(response, path) {
  assert(/no-store/i.test(String(response.headers['cache-control'] || '')), `${path} disables cache`, { cacheControl: response.headers['cache-control'] || null });
}

const health = await request('/api/health');
assert(health.status === 200 && health.data?.ok === true, '/api/health returns healthy 200', { status: health.status });
assertNoStore(health, '/api/health');
assert(health.data?.app === 'iqwars', '/api/health identifies IQ WARS');
assert(health.data?.launchReady === true, '/api/health reports launchReady true');
assert(health.data?.storage?.persistent === true && health.data?.storage?.verified === true && health.data?.storage?.launchReady === true, '/api/health verifies persistent storage', {
  provider: health.data?.storage?.provider || null,
});
assert(Boolean(health.data?.storage?.provider) && !/tmp|memory|ephemeral|none/i.test(String(health.data?.storage?.provider)), '/api/health uses non-ephemeral storage', {
  provider: health.data?.storage?.provider || null,
});
assert(health.data?.recursiv?.configured === true && health.data?.recursiv?.verified === true && health.data?.recursiv?.projectAccess === true, '/api/health verifies Recursiv project access', {
  origin: health.data?.recursiv?.origin || null,
});

const ready = await request('/api/ready');
assert(ready.status === 200 && ready.data?.ok === true && ready.data?.launchReady === true, '/api/ready gates launch traffic with 200', { status: ready.status });
assertNoStore(ready, '/api/ready');
assert(ready.data?.checks?.storage?.persistent === true && ready.data?.checks?.storage?.verified === true, '/api/ready verifies persistent storage');
assert(ready.data?.checks?.recursiv?.verified === true && ready.data?.checks?.recursiv?.projectAccess === true, '/api/ready verifies Recursiv project access');
assert(ready.data?.checks?.storage?.provider === health.data?.storage?.provider, '/api/health and /api/ready agree on storage provider', {
  health: health.data?.storage?.provider || null,
  ready: ready.data?.checks?.storage?.provider || null,
});

const leaderboard = await request('/api/leaderboards?agents=false');
assert(leaderboard.status === 200 && Array.isArray(leaderboard.data?.global) && leaderboard.data?.geography, '/api/leaderboards returns live ranking payload');
assertNoStore(leaderboard, '/api/leaderboards');
assert(![...(leaderboard.data?.global || []), ...(leaderboard.data?.group || [])].some((entry) => String(entry.playerId || '').startsWith('agent-')), '/api/leaderboards agents=false excludes seeded agents');

for (const route of criticalRoutes) {
  const response = await request(route.path, { expectJson: false });
  assert(response.status === 200, `${route.path} route returns 200`, { status: response.status });
  for (const snippet of route.snippets) {
    assert(response.text.includes(snippet), `${route.path} renders ${snippet}`);
  }
}

console.log(JSON.stringify({
  origin,
  passed: passes.length,
  failures: failures.length,
  storageProvider: health.data?.storage?.provider || null,
  recursivProjectAccess: Boolean(health.data?.recursiv?.projectAccess),
}, null, 2));

if (failures.length) process.exit(1);
