#!/usr/bin/env node

const args = process.argv.slice(2);
const origin = String(valueAfter('--origin') || process.env.IQWARS_DEPLOY_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
const expectedCommit = String(valueAfter('--expected-commit') || process.env.IQWARS_EXPECTED_COMMIT || '').trim().toLowerCase();
const triggerDeploy = args.includes('--trigger');
const monitorMs = Number(valueAfter('--monitor-ms') || (triggerDeploy ? 900_000 : 60_000));
const intervalMs = Number(valueAfter('--interval-ms') || 5_000);
const timeoutMs = Number(valueAfter('--timeout-ms') || 10_000);
const appUuid = valueAfter('--app-uuid') || process.env.IQWARS_COOLIFY_APP_UUID || process.env.COOLIFY_APP_UUID || 'nu38x7705v0z961mpbighllf';
const coolifyApi = String(valueAfter('--coolify-api-url') || process.env.COOLIFY_API_URL || '').replace(/\/+$/, '');
const coolifyToken = valueAfter('--coolify-token') || process.env.COOLIFY_API_TOKEN || '';

const failures = [];
const samples = [];
const deploymentPolls = [];

function valueAfter(flag) {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function fail(message, details = undefined) {
  failures.push({ message, details });
  console.error(`FAIL ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

function pass(message, details = undefined) {
  console.log(`PASS ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(path) {
  const response = await fetchWithTimeout(`${origin}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    fail(`${path} returns parseable JSON`, { status: response.status, body: text.slice(0, 240) });
  }
  return { response, data };
}

async function publicProbe(label) {
  const startedAt = Date.now();
  try {
    const health = await requestJson('/api/health');
    const ready = await requestJson('/api/ready');
    const version = await requestJson('/api/version');
    const sample = {
      label,
      ok: health.response.ok && ready.response.ok && version.response.ok,
      healthStatus: health.response.status,
      readyStatus: ready.response.status,
      versionStatus: version.response.status,
      launchReady: Boolean(health.data?.launchReady) && Boolean(ready.data?.launchReady),
      storage: health.data?.storage?.provider || null,
      commit: String(version.data?.commit || ''),
      elapsedMs: Date.now() - startedAt,
    };
    samples.push(sample);

    if (!sample.ok) fail('Public deploy probe saw non-200 launch endpoint', sample);
    if (!sample.launchReady) fail('Public deploy probe saw launchReady false', sample);
    if (expectedCommit && sample.commit && sample.commit !== expectedCommit && !sample.commit.startsWith(expectedCommit.slice(0, 12))) {
      // This is acceptable while a deployment is rolling. The final check below enforces the expected commit.
      console.log(`INFO deploy probe still serving ${sample.commit.slice(0, 8) || 'unknown'} during ${label}`);
    }
    return sample;
  } catch (error) {
    const sample = { label, ok: false, error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startedAt };
    samples.push(sample);
    fail('Public deploy probe failed', sample);
    return sample;
  }
}

async function coolify(path, init = {}) {
  if (!coolifyApi || !coolifyToken) throw new Error('Set COOLIFY_API_URL and COOLIFY_API_TOKEN to trigger or poll Coolify deploys.');
  const response = await fetchWithTimeout(`${coolifyApi}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${coolifyToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`Coolify ${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function deploymentRows(payload) {
  return Array.isArray(payload) ? payload : payload?.data || payload?.deployments || [];
}

async function latestDeployment() {
  const payload = await coolify(`/deployments/applications/${appUuid}?take=5`);
  return deploymentRows(payload)[0] || null;
}

async function triggerCoolifyDeploy() {
  await coolify(`/applications/${appUuid}`);
  const response = await coolify(`/deploy?uuid=${appUuid}&force=true`, { method: 'GET' });
  pass('Coolify deploy triggered', { deployment: response?.deployment_uuid || response?.uuid || null, expectedCommit: expectedCommit || null });
}

let probeTimer = null;
let probeCount = 0;

function startProbeLoop() {
  probeTimer = setInterval(() => {
    probeCount += 1;
    void publicProbe(`probe-${probeCount}`);
  }, intervalMs);
}

function stopProbeLoop() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

await publicProbe('before');
startProbeLoop();

try {
  if (triggerDeploy) {
    await triggerCoolifyDeploy();
    const deadline = Date.now() + monitorMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const latest = await latestDeployment();
      const status = latest?.status || latest?.state || latest?.deployment_status || null;
      const commit = String(latest?.commit || latest?.commit_sha || latest?.git_commit_sha || latest?.git_commit || '');
      const row = {
        deployment: latest?.deployment_uuid || latest?.uuid || latest?.id || null,
        status,
        commit,
      };
      deploymentPolls.push(row);
      console.log(`INFO coolify ${JSON.stringify(row)}`);
      if (expectedCommit && commit && !commit.startsWith(expectedCommit.slice(0, 8))) continue;
      if (status && !/in_progress|queued|building|running/i.test(String(status))) break;
    }
  } else {
    await new Promise((resolve) => setTimeout(resolve, monitorMs));
  }
} finally {
  stopProbeLoop();
}

const after = await publicProbe('after');
if (expectedCommit) {
  if (!after.commit || (!after.commit.startsWith(expectedCommit.slice(0, 12)) && after.commit !== expectedCommit)) {
    fail('Final deployed commit does not match expected commit', { expectedCommit, actualCommit: after.commit || null });
  }
}

if (triggerDeploy) {
  const latest = deploymentPolls[deploymentPolls.length - 1] || null;
  if (!latest || !latest.status || /failed|error|cancel/i.test(String(latest.status))) {
    fail('Coolify deployment did not finish successfully', latest);
  }
  if (latest?.status && /in_progress|queued|building|running/i.test(String(latest.status))) {
    fail('Coolify deployment did not reach a terminal status before timeout', latest);
  }
}

const outageSamples = samples.filter((sample) => !sample.ok || sample.launchReady === false || sample.error);
if (outageSamples.length) {
  fail('No-downtime probe observed unhealthy samples', { count: outageSamples.length, first: outageSamples[0] });
}

if (!samples.length) fail('No public deploy probes were collected.');

if (!failures.length) {
  pass('No-downtime deploy proof passed', {
    origin,
    probes: samples.length,
    triggerDeploy,
    expectedCommit: expectedCommit || null,
    finalCommit: after.commit ? after.commit.slice(0, 8) : null,
  });
}

console.log(JSON.stringify({
  origin,
  triggerDeploy,
  expectedCommit: expectedCommit || null,
  probes: samples.length,
  deploymentPolls: deploymentPolls.length,
  failures: failures.length,
  finalCommit: after.commit || null,
}, null, 2));

if (failures.length) process.exit(1);
