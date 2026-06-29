#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const origin = valueAfter('--origin') || process.env.IQWARS_FOUC_ORIGIN || 'https://iqwars.app';
const outDir = valueAfter('--out') || path.join(os.tmpdir(), 'iqwars-fouc-trace');
const chromePort = Number(valueAfter('--port') || process.env.IQWARS_FOUC_CHROME_PORT || 9341);
const debugBase = `http://127.0.0.1:${chromePort}`;
const userDataDir = path.join(os.tmpdir(), `iqwars-fouc-chrome-${chromePort}`);
const base = origin.replace(/\/$/, '');

const routes = [
  { id: 'home', path: '/' },
  { id: 'room', path: '/g/room-kdljky' },
  { id: 'rankings', path: '/rankings?g=room-kdljky' },
];

const viewport = {
  width: 393,
  height: 852,
  mobile: true,
  deviceScaleFactor: 2,
};

const results = [];
const traces = [];

function valueAfter(flag) {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pass(message, details = null) {
  results.push({ ok: true, message, details });
  console.log(`PASS ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

function fail(message, details = null) {
  results.push({ ok: false, message, details });
  console.error(`FAIL ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

async function chromeAvailable() {
  try {
    const response = await fetch(`${debugBase}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

function launchChrome() {
  const commonArgs = [
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ];

  const explicit = process.env.AUDIT_CHROME_BINARY;
  if (explicit) {
    spawn(explicit, ['--headless=new', '--disable-gpu', ...commonArgs], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', ...commonArgs], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  for (const binary of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    spawn(binary, ['--headless=new', '--disable-gpu', ...commonArgs], { detached: true, stdio: 'ignore' });
  }
}

async function ensureChrome() {
  if (await chromeAvailable()) return;
  launchChrome();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(250);
    if (await chromeAvailable()) return;
  }
  throw new Error(`Chrome remote debugging is not available at ${debugBase}.`);
}

async function openTarget(url) {
  const endpoint = `${debugBase}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: 'PUT' }).catch(() => null);
  if (!response || !response.ok) response = await fetch(endpoint).catch(() => null);
  if (!response || !response.ok) throw new Error(`Failed to open Chrome target for ${url}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error(`Chrome target for ${url} returned no debugger URL.`);
  return target;
}

async function closeTarget(target) {
  if (!target?.id) return;
  await fetch(`${debugBase}/json/close/${encodeURIComponent(target.id)}`).catch(() => null);
}

function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = {
    failedRequests: [],
    responseErrors: [],
    exceptions: [],
  };

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Network.loadingFailed') events.failedRequests.push(message.params);
    if (message.method === 'Network.responseReceived' && message.params?.response?.status >= 400) events.responseErrors.push(message.params);
    if (message.method === 'Runtime.exceptionThrown') events.exceptions.push(message.params);
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  return {
    events,
    ready,
    close: () => ws.close(),
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject });
      });
    },
  };
}

function firstPaintSampler() {
  return `
    (() => {
      window.__iqwarsFoucSamples = [];
      const sample = (label) => {
        const body = document.body;
        const main = document.querySelector('main');
        const htmlStyle = getComputedStyle(document.documentElement);
        const bodyStyle = body ? getComputedStyle(body) : null;
        const mainStyle = main ? getComputedStyle(main) : null;
        const mainRect = main ? main.getBoundingClientRect() : null;
        window.__iqwarsFoucSamples.push({
          label,
          t: Math.round(performance.now()),
          href: location.href,
          readyState: document.readyState,
          bodyExists: Boolean(body),
          mainExists: Boolean(main),
          htmlBg: htmlStyle.backgroundColor,
          bodyBg: bodyStyle ? bodyStyle.backgroundColor : null,
          mainBg: mainStyle ? mainStyle.backgroundColor : null,
          mainBgImage: mainStyle ? mainStyle.backgroundImage.slice(0, 180) : null,
          mainRect: mainRect ? { left: Math.round(mainRect.left), top: Math.round(mainRect.top), width: Math.round(mainRect.width), height: Math.round(mainRect.height) } : null,
          bodyText: body ? body.innerText.slice(0, 140) : '',
          paints: performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: Math.round(entry.startTime) }))
        });
      };
      sample('new-document');
      requestAnimationFrame(() => sample('raf-1'));
      [16, 60, 140, 320, 700, 1200].forEach((delay) => window.setTimeout(() => sample('t+' + delay), delay));
    })();
  `;
}

function isWhite(color) {
  return /rgb\\(255,\\s*255,\\s*255\\)|white/i.test(String(color || ''));
}

function isTransparent(color) {
  return /rgba\\(0,\\s*0,\\s*0,\\s*0\\)|transparent/i.test(String(color || ''));
}

function hasNonWhiteVisibleSurface(sample) {
  if (!sample) return false;
  if (sample.mainExists && sample.mainRect?.width >= viewport.width - 2 && sample.mainRect?.height >= viewport.height - 2) {
    if (sample.mainBgImage && sample.mainBgImage !== 'none') return true;
    if (sample.mainBg && !isWhite(sample.mainBg) && !isTransparent(sample.mainBg)) return true;
  }
  return Boolean(
    sample.htmlBg
    && sample.bodyBg
    && !isWhite(sample.htmlBg)
    && !isWhite(sample.bodyBg)
    && !isTransparent(sample.htmlBg)
    && !isTransparent(sample.bodyBg)
  );
}

async function currentHref(send) {
  const result = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }).catch(() => null);
  return result?.result?.value || '';
}

async function collectLiveSample(send, label) {
  const expression = `
    (() => {
      const body = document.body;
      const main = document.querySelector('main');
      const htmlStyle = getComputedStyle(document.documentElement);
      const bodyStyle = body ? getComputedStyle(body) : null;
      const mainStyle = main ? getComputedStyle(main) : null;
      const mainRect = main ? main.getBoundingClientRect() : null;
      return JSON.stringify({
        label: ${JSON.stringify(label)},
        t: Math.round(performance.now()),
        href: location.href,
        readyState: document.readyState,
        bodyExists: Boolean(body),
        mainExists: Boolean(main),
        htmlBg: htmlStyle.backgroundColor,
        bodyBg: bodyStyle ? bodyStyle.backgroundColor : null,
        mainBg: mainStyle ? mainStyle.backgroundColor : null,
        mainBgImage: mainStyle ? mainStyle.backgroundImage.slice(0, 180) : null,
        mainRect: mainRect ? { left: Math.round(mainRect.left), top: Math.round(mainRect.top), width: Math.round(mainRect.width), height: Math.round(mainRect.height) } : null,
        bodyText: body ? body.innerText.slice(0, 140) : '',
        paints: performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: Math.round(entry.startTime) }))
      });
    })()
  `;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true }).catch(() => null);
  if (!result?.result?.value) return null;
  return JSON.parse(result.result.value);
}

async function captureScreenshot(send, file) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(file, Buffer.from(screenshot.data, 'base64'));
}

async function auditRoute(route) {
  const url = `${base}${route.path}`;
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 260,
      downloadThroughput: 46 * 1024,
      uploadThroughput: 24 * 1024,
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: firstPaintSampler() });
    await client.send('Page.navigate', { url });

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const href = await currentHref(client.send);
      if (href.startsWith(base)) break;
      await sleep(25);
    }

    const directSamples = [];
    const commitSample = await collectLiveSample(client.send, 'commit');
    if (commitSample) directSamples.push(commitSample);
    await sleep(80);
    const preEarlySample = await collectLiveSample(client.send, 'pre-early-screenshot');
    if (preEarlySample) directSamples.push(preEarlySample);
    await sleep(180);
    const earlyFile = path.join(outDir, `${route.id}-mobile-throttled-early.png`);
    await captureScreenshot(client.send, earlyFile);
    const earlySample = await collectLiveSample(client.send, 'early-screenshot');
    if (earlySample) directSamples.push(earlySample);
    await sleep(420);
    const midSample = await collectLiveSample(client.send, 'mid-load');
    if (midSample) directSamples.push(midSample);
    await sleep(1400);
    const settledFile = path.join(outDir, `${route.id}-mobile-throttled-settled.png`);
    await captureScreenshot(client.send, settledFile);
    const settledSample = await collectLiveSample(client.send, 'settled-screenshot');
    if (settledSample) directSamples.push(settledSample);

    const result = await client.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__iqwarsFoucSamples || [])',
      returnByValue: true,
    });
    const injectedSamples = JSON.parse(result.result.value || '[]');
    const samples = [...injectedSamples, ...directSamples];
    const committed = samples.filter((sample) => sample.href.startsWith(base) && sample.bodyExists);
    const weakSurfaceSamples = committed.filter((sample) => !hasNonWhiteVisibleSurface(sample));
    traces.push({ route: route.id, url, earlyFile, settledFile, samples });

    if (committed.length >= 3) pass(`${route.id} records throttled first-paint samples`, { samples: committed.length, first: committed[0] });
    else fail(`${route.id} records throttled first-paint samples`, { samples });

    if (weakSurfaceSamples.length === 0) pass(`${route.id} keeps mobile first-paint surface non-white under throttling`, { checked: committed.length });
    else fail(`${route.id} keeps mobile first-paint surface non-white under throttling`, { weakSurfaceSamples });

    const firstMain = committed.find((sample) => sample.mainExists);
    if (firstMain && firstMain.t <= 4500) pass(`${route.id} paints the app shell during throttled mobile load`, firstMain);
    else fail(`${route.id} paints the app shell during throttled mobile load`, { committed });

    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const responseUrl = entry.response?.url || '';
      return status >= 500 || (status >= 400 && responseUrl.includes('/api/'));
    });
    if (blockingResponses.length === 0) pass(`${route.id} has no blocking HTTP errors during FOUC trace`);
    else fail(`${route.id} has no blocking HTTP errors during FOUC trace`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));

    pass(`${route.id} FOUC trace screenshots captured`, { earlyFile, settledFile });
  } finally {
    client.close();
    await closeTarget(target);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await ensureChrome();
  for (const route of routes) {
    await auditRoute(route);
  }
  const traceFile = path.join(outDir, 'fouc-trace.json');
  await writeFile(traceFile, JSON.stringify({ origin: base, viewport, traces }, null, 2));
  pass('FOUC trace JSON captured', { traceFile });

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ passed: results.length - failed.length, failures: failed.length, outDir }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  fail('FOUC trace crashed', { error: error instanceof Error ? error.stack || error.message : String(error) });
  process.exit(1);
});
