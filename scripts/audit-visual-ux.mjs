import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const origin = valueAfter('--origin') || process.env.IQWARS_VISUAL_ORIGIN || 'https://iqwars.app';
const outDir = valueAfter('--out') || path.join(os.tmpdir(), 'iqwars-visual-audit');
const chromePort = Number(valueAfter('--port') || process.env.IQWARS_CHROME_DEBUG_PORT || 9339);
const debugBase = `http://127.0.0.1:${chromePort}`;
const userDataDir = path.join(os.tmpdir(), `iqwars-chrome-${chromePort}`);
const waitMs = Number(valueAfter('--wait-ms') || 2400);
const homeQuestionChecks = Math.max(1, Number(valueAfter('--home-question-checks') || 3));

const viewports = [
  { id: 'mobile', width: 393, height: 852, mobile: true, deviceScaleFactor: 2 },
  { id: 'desktop', width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
];

const routes = [
  { id: 'home', path: '/', checks: ['home'] },
  { id: 'room', path: '/g/room-kdljky', checks: ['room'] },
  { id: 'rankings', path: '/rankings?g=room-kdljky', checks: ['rankings'] },
];

const results = [];
let roomFixture = null;
let geographyFixture = null;

function valueAfter(flag) {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function clearAuditPlayerStorageScript() {
  return `
    (() => {
      [
        'world-iq-official-rank',
        'world-iq-official-history',
        'world-iq-play-usage',
        'world-iq-free-play-date',
        'world-iq-player-id',
        'world-iq-player-name',
        'world-iq-player-username',
        'world-iq-group-code',
        'world-iq-group-name',
        'world-iq-groups',
        'world-iq-leaderboard',
        'world-iq-recursiv-account'
      ].forEach((key) => window.localStorage.removeItem(key));
    })();
  `;
}

function lockedDailyStorageScript({ loggedIn = false } = {}) {
  return `
    (() => {
      const pad = (value) => String(value).padStart(2, '0');
      const now = new Date();
      const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      window.localStorage.setItem('world-iq-player-id', ${JSON.stringify(`locked-audit-${loggedIn ? 'in' : 'out'}`)});
      window.localStorage.setItem('world-iq-player-name', ${JSON.stringify(loggedIn ? 'Locked Logged In' : 'Locked Logged Out')});
      window.localStorage.setItem('world-iq-play-usage', JSON.stringify({ day, count: 1 }));
      window.localStorage.setItem('world-iq-official-rank', JSON.stringify({
        day,
        score: 137,
        rank: '#30,000',
        percentile: 97,
        correct: 10,
        total: 12,
        beatAi: 3,
        elapsedMs: 270000,
        speedBonus: 4,
        timestamp: Date.now()
      }));
      if (${loggedIn ? 'true' : 'false'}) {
        window.localStorage.setItem('world-iq-recursiv-account', JSON.stringify({
          email: 'locked-audit@iqwars.app',
          name: 'Locked Audit',
          updatedAt: Date.now()
        }));
      } else {
        window.localStorage.removeItem('world-iq-recursiv-account');
      }
    })();
  `;
}

function pass(message, details = null) {
  results.push({ ok: true, message, details });
  console.log(`PASS ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

function fail(message, details = null) {
  results.push({ ok: false, message, details });
  console.error(`FAIL ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

async function loadRoomFixture() {
  const room = 'room-kdljky';
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/api/leaderboards?group=${encodeURIComponent(room)}&agents=false`, { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      fail('production room fixture API is readable for visual audit', { status: response.status, data });
      return null;
    }
    const group = Array.isArray(data.group) ? data.group : [];
    const groupAllTime = Array.isArray(data.groupAllTime) ? data.groupAllTime : [];
    const geography = data.geography && typeof data.geography === 'object' ? data.geography : {};
    const countries = Array.isArray(geography.countries) ? geography.countries : [];
    const cities = Array.isArray(geography.cities) ? geography.cities : [];
    const towns = Array.isArray(geography.towns) ? geography.towns : [];
    const topRecord = groupAllTime[0] || null;
    const fixture = {
      room,
      day: data.day,
      todayCount: group.length,
      allTimeCount: groupAllTime.length,
      topRecordScore: topRecord?.score ?? null,
      topRecordName: topRecord ? (topRecord.username ? `@${topRecord.username}` : topRecord.displayName) : null,
      topRecordDay: topRecord?.day ?? null,
    };
    geographyFixture = {
      globalCount: Array.isArray(data.global) ? data.global.length : 0,
      countriesCount: countries.length,
      citiesCount: cities.length,
      townsCount: towns.length,
      expectedRegionMarkers: Math.min(18, countries.length + cities.slice(0, 8).length + towns.slice(0, 5).length),
      topCountry: countries[0] || null,
      topCity: cities[0] || null,
      topTown: towns[0] || null,
    };
    pass('production room fixture API exposes daily and all-time boards', fixture);
    pass('production geography fixture API exposes real geography boards', geographyFixture);
    return fixture;
  } catch (error) {
    fail('production room fixture API is readable for visual audit', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
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
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    spawn(chrome, ['--headless=new', '--disable-gpu', ...commonArgs], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  for (const binary of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    spawn(binary, ['--headless=new', '--disable-gpu', ...commonArgs], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function ensureChrome() {
  if (await chromeAvailable()) return;
  launchChrome();
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function requestJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = {
    exceptions: [],
    failedRequests: [],
    responseErrors: [],
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
    if (message.method === 'Runtime.exceptionThrown') events.exceptions.push(message.params);
    if (message.method === 'Network.loadingFailed') events.failedRequests.push(message.params);
    if (message.method === 'Network.responseReceived' && message.params?.response?.status >= 400) events.responseErrors.push(message.params);
  });

  function send(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  }

  return {
    events,
    send,
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    }),
    close: () => ws.close(),
  };
}

async function waitForReady(send, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await send('Runtime.evaluate', {
      expression: "document.readyState === 'complete' && Boolean(document.querySelector('.runner-panel, .leaderboard, .account-gate'))",
      returnByValue: true,
    }).catch(() => null);
    if (ready?.result?.value) return true;
    await sleep(250);
  }
  return false;
}

function evaluationScript(routeId, viewportId) {
  return `
    (() => {
      const viewport = { width: innerWidth, height: innerHeight };
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
      };
      const text = (el) => (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || 1) > 0.01;
      };
      const runner = document.querySelector('.runner-panel');
      const matrix = document.querySelector('.matrix');
      const questionPad = document.querySelector('.question-pad');
      const options = [...document.querySelectorAll('.option')];
      const optionTiles = [...document.querySelectorAll('.option .tile')];
      const lockButton = [...document.querySelectorAll('button.primary')].find((button) => /lock answer|next question|see score/i.test(text(button))) || null;
      const menuButton = document.querySelector('.command-toggle');
      const commandPanel = document.querySelector('.command-panel');
      const commandProfile = document.querySelector('.command-profile');
      const commandRoomCard = document.querySelector('.command-room-card');
      const commandScroll = document.querySelector('.command-scroll');
      const closeCommand = document.querySelector('.close-command');
      const commandNavButtons = [...document.querySelectorAll('.command-grid button')];
      const answerFeedback = document.querySelector('.answer-feedback');
      const lockedScoreGrid = document.querySelector('.locked-score-grid');
      const lockedScoreCells = [...document.querySelectorAll('.locked-score-grid div')].map((item) => ({
        label: text(item.querySelector('span')),
        value: text(item.querySelector('strong')),
        rect: rect(item),
      }));
      const lockedActions = [...document.querySelectorAll('.locked-actions button')].map((item) => ({
        text: text(item),
        rect: rect(item),
      }));
      const resultCorrect = document.querySelector('.option.result-correct');
      const resultWrong = document.querySelector('.option.result-wrong');
      const proofPill = document.querySelector('.proof-pill');
      const proofPopover = document.querySelector('.proof-popover');
      const roomRecordStrip = document.querySelector('.room-record-strip');
      const roomRecordMetrics = [...document.querySelectorAll('.room-record-metrics div')].map((item) => ({
        label: text(item.querySelector('span')),
        value: text(item.querySelector('strong')),
        detail: text(item.querySelector('em')),
      }));
      const primaryRoomBoard = document.querySelector('.primary-board');
      const primaryRoomRows = [...document.querySelectorAll('.primary-board .leaderboard-row')].length;
      const primaryRoomEmpty = document.querySelector('.primary-board .empty-board');
      const rankingsGlobeHero = document.querySelector('.rankings-globe-hero');
      const rankingsGlobe = document.querySelector('.rankings-globe');
      const rankingsRegions = [...document.querySelectorAll('.rankings-region')].filter(visible);
      const rankingGlobeStats = [...document.querySelectorAll('.ranking-globe-stats div')].map((item) => ({
        value: text(item.querySelector('strong')),
        label: text(item.querySelector('span')),
      }));
      const geographyBoard = document.querySelector('.geography-board');
      const geoColumns = [...document.querySelectorAll('.geo-column')].map((item) => ({
        label: text(item.querySelector('.geo-column-head span')),
        count: text(item.querySelector('.geo-column-head strong')),
        rows: [...item.querySelectorAll('.geo-rows .leaderboard-row')].length,
        text: text(item).slice(0, 900),
      }));
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
      const optionRects = options.map(rect).filter(Boolean);
      const tileRects = optionTiles.map(rect).filter(Boolean);
      const minOption = optionRects.reduce((min, r) => Math.min(min, r.width, r.height), Infinity);
      const minTile = tileRects.reduce((min, r) => Math.min(min, r.width, r.height), Infinity);
      const overflows = [...document.querySelectorAll('body *')].filter((el) => {
        if (el.closest('[aria-hidden="true"]')) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return visible(el) && s.position !== 'fixed' && (r.right > viewport.width + 6 || r.left < -6);
      }).slice(0, 12).map((el) => ({ tag: el.tagName, className: String(el.className || '').slice(0, 120), rect: rect(el), text: text(el).slice(0, 80) }));
      return JSON.stringify({
        routeId: ${JSON.stringify(routeId)},
        viewportId: ${JSON.stringify(viewportId)},
        href: location.href,
        title: document.title,
        viewport,
        bodyBg,
        htmlBg,
        bodyText: text(document.body).slice(0, 3500),
        runner: rect(runner),
        questionPad: rect(questionPad),
        matrix: rect(matrix),
        options: optionRects,
        optionTiles: tileRects,
        optionCount: options.length,
        minOption: Number.isFinite(minOption) ? minOption : null,
        minTile: Number.isFinite(minTile) ? minTile : null,
        lockButton: rect(lockButton),
        lockText: text(lockButton),
        menuButton: rect(menuButton),
        commandPanel: rect(commandPanel),
        commandPanelVisible: visible(commandPanel),
        commandPanelText: text(commandPanel).slice(0, 1600),
        commandProfile: rect(commandProfile),
        commandRoomCard: rect(commandRoomCard),
        commandScroll: rect(commandScroll),
        closeCommand: rect(closeCommand),
        commandNavButtonCount: commandNavButtons.length,
        answerFeedback: rect(answerFeedback),
        answerFeedbackText: text(answerFeedback),
        lockedScoreGrid: rect(lockedScoreGrid),
        lockedScoreCells,
        lockedActions,
        resultCorrect: rect(resultCorrect),
        resultWrong: rect(resultWrong),
        proofPill: rect(proofPill),
        proofPopover: rect(proofPopover),
        proofPopoverText: text(proofPopover),
        proofPopoverVisible: visible(proofPopover),
        roomRecordStripText: text(roomRecordStrip).slice(0, 1200),
        roomRecordMetrics,
        primaryRoomBoardText: text(primaryRoomBoard).slice(0, 1200),
        primaryRoomRows,
        primaryRoomEmptyText: text(primaryRoomEmpty),
        rankingsGlobeHero: rect(rankingsGlobeHero),
        rankingsGlobe: rect(rankingsGlobe),
        rankingsRegionCount: rankingsRegions.length,
        rankingsRegionRects: rankingsRegions.map(rect).filter(Boolean).slice(0, 8),
        rankingGlobeStats,
        geographyBoard: rect(geographyBoard),
        geographyBoardText: text(geographyBoard).slice(0, 1800),
        geoColumns,
        visibleRoomRecords: /Room records|All-time room highscores|Best scores ever in this room/i.test(text(document.body)),
        visibleRoomHighscore: /Ongoing room highscore|Room highscore|all-time room highscore/i.test(text(document.body)),
        visibleFriendRankings: /friend rankings|Today's room board|Today resets daily/i.test(text(document.body)),
        visibleGlobe: /World signal|Global signal|Geography|Countries|Cities|Towns/i.test(text(document.body)) || Boolean(document.querySelector('.geo-globe, .rankings-globe, .globe')),
        overflows,
      });
    })()
  `;
}

async function evaluate(send, routeId, viewportId) {
  const result = await send('Runtime.evaluate', {
    expression: evaluationScript(routeId, viewportId),
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

async function clickOptionAndLock(send, optionPosition = 'first') {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const options = [...document.querySelectorAll('.option')];
        const option = ${JSON.stringify(optionPosition)} === 'last' ? options[options.length - 1] : options[0];
        if (!option) return JSON.stringify({ clicked: false, reason: 'missing option' });
        option.click();
        return JSON.stringify({ selected: true, optionIndex: options.indexOf(option), optionCount: options.length });
      })()
    `,
    returnByValue: true,
  });
  const selected = JSON.parse(result.result.value);
  if (!selected.selected) return selected;
  await sleep(250);
  const lockResult = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const lock = [...document.querySelectorAll('button.primary')].find((button) => /lock answer/i.test((button.textContent || '')));
        if (!lock) return JSON.stringify({ clicked: false, reason: 'missing lock' });
        const disabled = lock.disabled;
        if (!disabled) lock.click();
        return JSON.stringify({ clicked: !disabled, disabled });
      })()
    `,
    returnByValue: true,
  });
  await sleep(700);
  return JSON.parse(lockResult.result.value);
}

async function clickPrimaryButton(send, matchText) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wanted = ${JSON.stringify(matchText)}.toLowerCase();
        const button = [...document.querySelectorAll('button.primary')].find((candidate) => (candidate.textContent || '').toLowerCase().includes(wanted));
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing primary', wanted });
        const disabled = button.disabled;
        if (!disabled) button.click();
        return JSON.stringify({ clicked: !disabled, disabled, text: (button.textContent || '').trim() });
      })()
    `,
    returnByValue: true,
  });
  await sleep(500);
  return JSON.parse(result.result.value);
}

async function openCommandCenter(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const button = document.querySelector('.command-toggle');
        if (!button) return JSON.stringify({ opened: false, reason: 'missing toggle' });
        button.click();
        return JSON.stringify({ opened: true });
      })()
    `,
    returnByValue: true,
  });
  await sleep(350);
  return JSON.parse(result.result.value);
}

async function closeCommandCenter(send) {
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const button = document.querySelector('.close-command') || document.querySelector('.command-backdrop');
        if (button) button.click();
        return true;
      })()
    `,
    returnByValue: true,
  }).catch(() => null);
  await sleep(250);
}

async function pressKey(send, key, code, windowsVirtualKeyCode, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers });
  await sleep(220);
}

async function focusCommandToggle(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const button = document.querySelector('.command-toggle');
        if (!button) return JSON.stringify({ focused: false, reason: 'missing command toggle' });
        button.focus();
        return JSON.stringify({ focused: document.activeElement === button });
      })()
    `,
    returnByValue: true,
  });
  await sleep(150);
  return JSON.parse(result.result.value);
}

async function activeElementState(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = (el) => (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || 1) > 0.01;
        };
        const active = document.activeElement;
        const panel = document.querySelector('.command-panel');
        const popover = document.querySelector('.proof-popover');
        return JSON.stringify({
          tag: active?.tagName || '',
          className: String(active?.className || ''),
          text: text(active).slice(0, 120),
          ariaLabel: active?.getAttribute?.('aria-label') || '',
          inCommandPanel: Boolean(panel && active && panel.contains(active)),
          commandPanelVisible: visible(panel),
          proofPopoverVisible: visible(popover),
          proofPopoverText: text(popover).slice(0, 500),
        });
      })()
    `,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

async function auditCommandKeyboard(send, routeId, viewportId) {
  const prefix = `${viewportId} ${routeId}`;
  const focused = await focusCommandToggle(send);
  if (!focused.focused) {
    fail(`${prefix} command center toggle receives keyboard focus`, focused);
    return;
  }
  pass(`${prefix} command center toggle receives keyboard focus`);

  await pressKey(send, 'Enter', 'Enter', 13);
  let active = await activeElementState(send);
  if (active.commandPanelVisible && active.inCommandPanel && /close-command/.test(active.className)) pass(`${prefix} keyboard opens command center and moves focus to close`, active);
  else fail(`${prefix} keyboard opens command center and moves focus to close`, active);

  await pressKey(send, 'Tab', 'Tab', 9, 8);
  active = await activeElementState(send);
  if (active.commandPanelVisible && active.inCommandPanel && !/command-backdrop/.test(active.className)) pass(`${prefix} Shift+Tab wraps inside command center`, active);
  else fail(`${prefix} Shift+Tab wraps inside command center`, active);

  await pressKey(send, 'Tab', 'Tab', 9);
  active = await activeElementState(send);
  if (active.commandPanelVisible && active.inCommandPanel && /close-command/.test(active.className)) pass(`${prefix} Tab wraps from final command item back to close`, active);
  else fail(`${prefix} Tab wraps from final command item back to close`, active);

  await pressKey(send, 'Tab', 'Tab', 9);
  active = await activeElementState(send);
  if (active.commandPanelVisible && active.inCommandPanel && !/close-command/.test(active.className)) pass(`${prefix} Tab reaches primary sidebar controls`, active);
  else fail(`${prefix} Tab reaches primary sidebar controls`, active);

  await pressKey(send, 'Escape', 'Escape', 27);
  active = await activeElementState(send);
  if (!active.commandPanelVisible && /command-toggle/.test(active.className)) pass(`${prefix} Escape closes command center and restores menu focus`, active);
  else fail(`${prefix} Escape closes command center and restores menu focus`, active);
}

async function hoverProofPill(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const pill = document.querySelector('.proof-pill');
        if (!pill) return JSON.stringify({ hovered: false, reason: 'missing proof pill' });
        const r = pill.getBoundingClientRect();
        return JSON.stringify({ hovered: true, x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()
    `,
    returnByValue: true,
  });
  const point = JSON.parse(result.result.value);
  if (!point.hovered) return point;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }).catch(() => null);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => null);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => null);
  await sleep(300);
  return point;
}

async function focusProofPill(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const pill = document.querySelector('.proof-pill');
        if (!pill) return JSON.stringify({ focused: false, reason: 'missing proof pill' });
        pill.focus();
        return JSON.stringify({ focused: document.activeElement === pill });
      })()
    `,
    returnByValue: true,
  });
  await sleep(300);
  return JSON.parse(result.result.value);
}

function assertCommon(state, routeId, viewportId) {
  const prefix = `${viewportId} ${routeId}`;
  if (/rgb\(255,\s*255,\s*255\)|white/i.test(`${state.bodyBg} ${state.htmlBg}`)) fail(`${prefix} avoids white FOUC surface`, { bodyBg: state.bodyBg, htmlBg: state.htmlBg });
  else pass(`${prefix} avoids white FOUC surface`, { bodyBg: state.bodyBg, htmlBg: state.htmlBg });

  if (state.overflows.length) fail(`${prefix} has no horizontal layout overflow`, state.overflows);
  else pass(`${prefix} has no horizontal layout overflow`);

  if (state.menuButton && state.menuButton.width >= 48 && state.menuButton.height >= 48) pass(`${prefix} menu touch target is usable`, state.menuButton);
  else fail(`${prefix} menu touch target is usable`, state.menuButton);
}

function assertCommandCenter(state, routeId, viewportId) {
  const prefix = `${viewportId} ${routeId}`;
  if (state.commandPanelVisible && state.commandPanel && state.commandPanel.left <= 1 && state.commandPanel.right <= state.viewport.width + 4 && state.commandPanel.height >= state.viewport.height - 4) {
    pass(`${prefix} command center opens as a left sidebar`, state.commandPanel);
  } else {
    fail(`${prefix} command center opens as a left sidebar`, { panel: state.commandPanel, text: state.commandPanelText?.slice(0, 300) });
  }

  if (state.closeCommand && state.closeCommand.width >= 44 && state.closeCommand.height >= 44) pass(`${prefix} command center close target is usable`, state.closeCommand);
  else fail(`${prefix} command center close target is usable`, state.closeCommand);

  if (state.commandProfile && /Score|Logged|Guest|Unrated/i.test(state.commandPanelText)) pass(`${prefix} command center exposes identity and score`);
  else fail(`${prefix} command center exposes identity and score`, { text: state.commandPanelText?.slice(0, 500) });

  if (state.commandNavButtonCount >= 5 && /Today|Rankings|About|Research|Blog/i.test(state.commandPanelText)) pass(`${prefix} command center exposes primary navigation`, { buttons: state.commandNavButtonCount });
  else fail(`${prefix} command center exposes primary navigation`, { buttons: state.commandNavButtonCount, text: state.commandPanelText?.slice(0, 500) });

  if (state.commandRoomCard && /Friend groups|No active group|Active private group|Create/i.test(state.commandPanelText)) pass(`${prefix} command center exposes friend-group controls`);
  else fail(`${prefix} command center exposes friend-group controls`, { text: state.commandPanelText?.slice(0, 500) });
}

function assertHome(state, viewportId, label = 'home') {
  const prefix = `${viewportId} ${label}`;
  if (state.runner && state.runner.top < state.viewport.height) pass(`${prefix} runner is visible above the fold`, state.runner);
  else fail(`${prefix} runner is visible above the fold`, state.runner);

  if (state.questionPad && state.questionPad.bottom <= state.viewport.height + 4) pass(`${prefix} matrix/options fit above fold`, state.questionPad);
  else fail(`${prefix} matrix/options fit above fold`, state.questionPad);

  if (state.optionCount >= 4) pass(`${prefix} renders answer options`, { count: state.optionCount });
  else fail(`${prefix} renders answer options`, { count: state.optionCount });

  const minOptionTarget = viewportId === 'mobile' ? 44 : 52;
  if (state.minOption >= minOptionTarget) pass(`${prefix} answer options have stable touch/click targets`, { minOption: state.minOption });
  else fail(`${prefix} answer options have stable touch/click targets`, { minOption: state.minOption, target: minOptionTarget });

  const minTileTarget = viewportId === 'mobile' ? 28 : 42;
  if (state.minTile >= minTileTarget) pass(`${prefix} option symbols are not scrunched`, { minTile: state.minTile });
  else fail(`${prefix} option symbols are not scrunched`, { minTile: state.minTile, target: minTileTarget });

  if (state.lockButton && state.lockButton.bottom <= state.viewport.height + 4 && state.lockButton.height >= 54) pass(`${prefix} lock button is large and above fold`, state.lockButton);
  else fail(`${prefix} lock button is large and above fold`, state.lockButton);
}

function lockedCellValue(state, label) {
  const cell = (state.lockedScoreCells || []).find((item) => item.label.toLowerCase() === label.toLowerCase());
  return cell ? cell.value : null;
}

function assertLockedState(state, viewportId, label) {
  const prefix = `${viewportId} ${label}`;
  if (/Your one official attempt today is locked/i.test(state.bodyText)) pass(`${prefix} renders locked official-attempt message`);
  else fail(`${prefix} renders locked official-attempt message`, { bodyText: state.bodyText.slice(0, 900) });

  if (state.runner && state.runner.top < state.viewport.height && state.runner.bottom <= state.viewport.height + 4) pass(`${prefix} locked panel fits above fold`, state.runner);
  else fail(`${prefix} locked panel fits above fold`, { runner: state.runner, viewport: state.viewport });

  if (state.lockedScoreGrid && state.lockedScoreCells.length === 3) pass(`${prefix} renders locked score summary`, state.lockedScoreCells);
  else fail(`${prefix} renders locked score summary`, { grid: state.lockedScoreGrid, cells: state.lockedScoreCells });

  if (lockedCellValue(state, 'Score') === '137' && lockedCellValue(state, 'Rank') === '#30,000' && lockedCellValue(state, 'Accuracy') === '10/12') pass(`${prefix} renders saved score rank and accuracy`);
  else fail(`${prefix} renders saved score rank and accuracy`, { cells: state.lockedScoreCells });

  if ((state.lockedActions || []).some((item) => /View rankings/i.test(item.text)) && (state.lockedActions || []).some((item) => /Unlock profile/i.test(item.text))) pass(`${prefix} offers rankings and upgrade actions`, state.lockedActions);
  else fail(`${prefix} offers rankings and upgrade actions`, { actions: state.lockedActions, bodyText: state.bodyText.slice(0, 900) });

  if (state.optionCount === 0 && !/Lock answer/i.test(state.bodyText)) pass(`${prefix} does not expose another official answer flow`);
  else fail(`${prefix} does not expose another official answer flow`, { optionCount: state.optionCount, bodyText: state.bodyText.slice(0, 900) });
}

function assertWrongFeedback(state, viewportId) {
  const prefix = `${viewportId} home`;
  if (/Not quite/i.test(state.answerFeedbackText) && /Correct answer:/i.test(state.answerFeedbackText)) pass(`${prefix} shows explicit wrong-answer feedback`, { text: state.answerFeedbackText.slice(0, 240) });
  else fail(`${prefix} shows explicit wrong-answer feedback`, { text: state.answerFeedbackText?.slice(0, 500), bodyText: state.bodyText.slice(0, 700) });

  if (state.resultWrong && state.resultCorrect) pass(`${prefix} visually marks chosen wrong and correct answers`, { wrong: state.resultWrong, correct: state.resultCorrect });
  else fail(`${prefix} visually marks chosen wrong and correct answers`, { wrong: state.resultWrong, correct: state.resultCorrect });

  if (state.proofPill && /Proof/i.test(state.bodyText)) pass(`${prefix} exposes a proof affordance after answer lock`, state.proofPill);
  else fail(`${prefix} exposes a proof affordance after answer lock`, { bodyText: state.bodyText.slice(0, 700) });
}

function assertProofPopover(state, viewportId, trigger = 'hover') {
  const prefix = `${viewportId} home`;
  if (state.proofPopoverVisible && /Visual proof|Formal proof|Answer checksum/i.test(state.proofPopoverText)) pass(`${prefix} proof detail opens on ${trigger}`, { text: state.proofPopoverText.slice(0, 260) });
  else fail(`${prefix} proof detail opens on ${trigger}`, { visible: state.proofPopoverVisible, text: state.proofPopoverText?.slice(0, 500), rect: state.proofPopover });
}

function metricValue(state, label) {
  const metric = (state.roomRecordMetrics || []).find((item) => item.label.toLowerCase() === label.toLowerCase());
  return metric ? metric.value : null;
}

function assertRoomFixture(state, viewportId, routeId) {
  if (!roomFixture) return;
  const prefix = `${viewportId} ${routeId}`;
  if (metricValue(state, 'Today') === String(roomFixture.todayCount)) pass(`${prefix} renders live room today count`, { expected: roomFixture.todayCount });
  else fail(`${prefix} renders live room today count`, { expected: roomFixture.todayCount, metrics: state.roomRecordMetrics, text: state.roomRecordStripText });

  if (metricValue(state, 'All-time') === String(roomFixture.allTimeCount) || metricValue(state, 'All-time records') === String(roomFixture.allTimeCount)) pass(`${prefix} renders live room all-time count`, { expected: roomFixture.allTimeCount });
  else fail(`${prefix} renders live room all-time count`, { expected: roomFixture.allTimeCount, metrics: state.roomRecordMetrics, text: state.roomRecordStripText });

  if (roomFixture.topRecordScore === null) return;
  if (metricValue(state, 'Current record') === String(roomFixture.topRecordScore)) pass(`${prefix} renders live room current record score`, { expected: roomFixture.topRecordScore });
  else fail(`${prefix} renders live room current record score`, { expected: roomFixture.topRecordScore, metrics: state.roomRecordMetrics, text: state.roomRecordStripText });

  const topRecordVisible = state.roomRecordStripText.includes(String(roomFixture.topRecordScore))
    && (!roomFixture.topRecordName || state.roomRecordStripText.includes(roomFixture.topRecordName))
    && (!roomFixture.topRecordDay || state.roomRecordStripText.includes(roomFixture.topRecordDay));
  if (topRecordVisible) pass(`${prefix} renders live room all-time leader identity and date`, { score: roomFixture.topRecordScore, name: roomFixture.topRecordName, day: roomFixture.topRecordDay });
  else fail(`${prefix} renders live room all-time leader identity and date`, { fixture: roomFixture, text: state.roomRecordStripText });

  if (roomFixture.todayCount === 0) {
    if (/No friends have locked today|No one has locked today/i.test(`${state.primaryRoomBoardText} ${state.bodyText}`)) pass(`${prefix} explains empty daily board while retaining records`);
    else fail(`${prefix} explains empty daily board while retaining records`, { primary: state.primaryRoomBoardText, bodyText: state.bodyText.slice(0, 900) });
  } else if (state.primaryRoomRows === roomFixture.todayCount) {
    pass(`${prefix} renders live daily room rows`, { expected: roomFixture.todayCount });
  } else {
    fail(`${prefix} renders live daily room rows`, { expected: roomFixture.todayCount, rows: state.primaryRoomRows, text: state.primaryRoomBoardText });
  }
}

function geoColumn(state, label) {
  return (state.geoColumns || []).find((column) => column.label.toLowerCase() === label.toLowerCase()) || null;
}

function statValue(state, label) {
  const stat = (state.rankingGlobeStats || []).find((item) => item.label.toLowerCase() === label.toLowerCase());
  return stat ? stat.value : null;
}

function assertGeographyFixture(state, viewportId, routeId) {
  if (!geographyFixture) return;
  const prefix = `${viewportId} ${routeId}`;
  if (state.rankingsGlobeHero && state.rankingsGlobeHero.width >= Math.min(300, state.viewport.width - 30) && state.rankingsGlobeHero.height >= 260) pass(`${prefix} renders a prominent rankings globe hero`, state.rankingsGlobeHero);
  else fail(`${prefix} renders a prominent rankings globe hero`, { hero: state.rankingsGlobeHero, viewport: state.viewport });

  if (state.rankingsGlobe && state.rankingsGlobe.width >= 220 && state.rankingsGlobe.height >= 220) pass(`${prefix} renders a visible spherical globe`, state.rankingsGlobe);
  else fail(`${prefix} renders a visible spherical globe`, { globe: state.rankingsGlobe });

  if (state.rankingsRegionCount >= geographyFixture.expectedRegionMarkers) pass(`${prefix} renders live geography region markers`, { expected: geographyFixture.expectedRegionMarkers, actual: state.rankingsRegionCount });
  else fail(`${prefix} renders live geography region markers`, { expected: geographyFixture.expectedRegionMarkers, actual: state.rankingsRegionCount, rects: state.rankingsRegionRects });

  const signals = Number(statValue(state, 'signals'));
  if (Number.isFinite(signals) && signals >= geographyFixture.globalCount) pass(`${prefix} renders live signal count in globe stats`, { expectedAtLeast: geographyFixture.globalCount, actual: signals });
  else fail(`${prefix} renders live signal count in globe stats`, { expectedAtLeast: geographyFixture.globalCount, stats: state.rankingGlobeStats });

  for (const [label, expected, top] of [
    ['Countries', geographyFixture.countriesCount, geographyFixture.topCountry],
    ['Cities', geographyFixture.citiesCount, geographyFixture.topCity],
    ['Towns', geographyFixture.townsCount, geographyFixture.topTown],
  ]) {
    const column = geoColumn(state, label);
    if (column && column.count === String(expected) && column.rows === expected) pass(`${prefix} renders ${label.toLowerCase()} geography rows from live API`, { expected, top: top?.label || null });
    else fail(`${prefix} renders ${label.toLowerCase()} geography rows from live API`, { expected, column, columns: state.geoColumns });
    if (!top) continue;
    if (state.geographyBoardText.includes(top.label) && state.geographyBoardText.includes(String(top.score)) && state.geographyBoardText.includes(String(top.topScore))) pass(`${prefix} renders top ${label.toLowerCase()} score metadata`, { label: top.label, score: top.score, topScore: top.topScore });
    else fail(`${prefix} renders top ${label.toLowerCase()} score metadata`, { top, text: state.geographyBoardText });
  }
}

function assertRoom(state, viewportId) {
  const prefix = `${viewportId} room`;
  if (state.visibleFriendRankings) pass(`${prefix} opens friend rankings context`);
  else fail(`${prefix} opens friend rankings context`, { bodyText: state.bodyText.slice(0, 500) });
  if (state.visibleRoomRecords) pass(`${prefix} shows persistent room records`);
  else fail(`${prefix} shows persistent room records`, { bodyText: state.bodyText.slice(0, 500) });
  if (state.visibleRoomHighscore) pass(`${prefix} shows ongoing all-time room highscore summary`);
  else fail(`${prefix} shows ongoing all-time room highscore summary`, { bodyText: state.bodyText.slice(0, 700) });
  assertRoomFixture(state, viewportId, 'room');
}

function assertRankings(state, viewportId) {
  const prefix = `${viewportId} rankings`;
  if (state.visibleGlobe) pass(`${prefix} exposes geography/globe signal`);
  else fail(`${prefix} exposes geography/globe signal`, { bodyText: state.bodyText.slice(0, 700) });
  if (state.visibleRoomRecords) pass(`${prefix} preserves room records alongside rankings`);
  else fail(`${prefix} preserves room records alongside rankings`, { bodyText: state.bodyText.slice(0, 700) });
  if (state.visibleRoomHighscore) pass(`${prefix} preserves ongoing room highscore summary`);
  else fail(`${prefix} preserves ongoing room highscore summary`, { bodyText: state.bodyText.slice(0, 700) });
  assertRoomFixture(state, viewportId, 'rankings');
  assertGeographyFixture(state, viewportId, 'rankings');
}

async function auditRoute(route, viewport) {
  const url = `${origin.replace(/\/$/, '')}${route.path}`;
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: clearAuditPlayerStorageScript() });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile });
    await client.send('Page.navigate', { url });
    await waitForReady(client.send);
    await sleep(waitMs);

    const state = await evaluate(client.send, route.id, viewport.id);
    assertCommon(state, route.id, viewport.id);
    const commandOpened = await openCommandCenter(client.send);
    if (commandOpened.opened) {
      const commandState = await evaluate(client.send, route.id, `${viewport.id}-command`);
      assertCommandCenter(commandState, route.id, viewport.id);
    } else {
      fail(`${viewport.id} ${route.id} command center opens as a left sidebar`, commandOpened);
    }
    await closeCommandCenter(client.send);
    await auditCommandKeyboard(client.send, route.id, viewport.id);
    if (route.checks.includes('home')) {
      const settledState = await evaluate(client.send, route.id, viewport.id);
      assertHome(settledState, viewport.id);
      const click = await clickOptionAndLock(client.send, 'last');
      if (click.clicked) pass(`${viewport.id} home can select and lock an answer`);
      else fail(`${viewport.id} home can select and lock an answer`, click);
      const feedbackState = await evaluate(client.send, route.id, `${viewport.id}-feedback`);
      if (/Correct|Not quite|Proof|Score reacted/i.test(feedbackState.bodyText)) pass(`${viewport.id} home shows feedback after locking`);
      else fail(`${viewport.id} home shows feedback after locking`, { bodyText: feedbackState.bodyText.slice(0, 700) });
      assertWrongFeedback(feedbackState, viewport.id);
      const hovered = await hoverProofPill(client.send);
      if (!hovered.hovered) fail(`${viewport.id} home proof detail opens on hover`, hovered);
      else assertProofPopover(await evaluate(client.send, route.id, `${viewport.id}-proof-hover`), viewport.id, 'hover/tap');
      const proofFocused = await focusProofPill(client.send);
      if (!proofFocused.focused) fail(`${viewport.id} home proof detail opens on keyboard focus`, proofFocused);
      else assertProofPopover(await evaluate(client.send, route.id, `${viewport.id}-proof-focus`), viewport.id, 'keyboard focus');
      for (let questionNumber = 2; questionNumber <= homeQuestionChecks; questionNumber += 1) {
        const advanced = await clickPrimaryButton(client.send, 'next question');
        if (!advanced.clicked) {
          fail(`${viewport.id} home advances to question ${questionNumber}`, advanced);
          break;
        }
        const questionState = await evaluate(client.send, route.id, `${viewport.id}-q${questionNumber}`);
        assertHome(questionState, viewport.id, `home question ${questionNumber}`);
        if (questionNumber < homeQuestionChecks) {
          const nextClick = await clickOptionAndLock(client.send, 'last');
          if (nextClick.clicked) pass(`${viewport.id} home question ${questionNumber} can lock an answer`);
          else {
            fail(`${viewport.id} home question ${questionNumber} can lock an answer`, nextClick);
            break;
          }
        }
      }
    }
    if (route.checks.includes('room')) assertRoom(state, viewport.id);
    if (route.checks.includes('rankings')) assertRankings(state, viewport.id);

    if (client.events.exceptions.length) fail(`${viewport.id} ${route.id} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${route.id} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${route.id} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${route.id} has no blocking HTTP errors`);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const fileName = `${route.id}-${viewport.id}.png`;
    await writeFile(path.join(outDir, fileName), Buffer.from(screenshot.data, 'base64'));
    pass(`${viewport.id} ${route.id} screenshot captured`, { file: path.join(outDir, fileName) });
  } finally {
    client.close();
    await closeTarget(target);
  }
}

async function auditLateRoomJoinSync() {
  const base = origin.replace(/\/$/, '');
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const group = `audit-late-${suffix}`.slice(0, 32);
  const playerId = `visual-late-${suffix}`.slice(0, 72);
  const displayName = 'Late Sync Audit';
  const username = `late_${suffix.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`.toLowerCase();
  const day = todayKey();
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const pad = (value) => String(value).padStart(2, '0');
          const now = new Date();
          const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
          window.localStorage.setItem('world-iq-player-id', ${JSON.stringify(playerId)});
          window.localStorage.setItem('world-iq-player-name', ${JSON.stringify(displayName)});
          window.localStorage.setItem('world-iq-player-username', ${JSON.stringify(username)});
          window.localStorage.setItem('world-iq-official-rank', JSON.stringify({
            day,
            score: 200,
            rank: '#1',
            percentile: 99.9,
            correct: 10,
            total: 12,
            beatAi: 3,
            elapsedMs: 270000,
            speedBonus: 99,
            timestamp: Date.now()
          }));
        })();
      `,
    });
    await client.send('Page.navigate', { url: `${base}/g/${group}` });
    await waitForReady(client.send);
    await sleep(waitMs);

    let synced = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const result = await requestJson(`${base}/api/leaderboards?day=${encodeURIComponent(day)}&group=${encodeURIComponent(group)}&agents=false`);
      const groupRows = Array.isArray(result.data?.group) ? result.data.group : [];
      const allTimeRows = Array.isArray(result.data?.groupAllTime) ? result.data.groupAllTime : [];
      const row = [...groupRows, ...allTimeRows].find((entry) => entry.playerId === playerId);
      if (result.response.ok && row) {
        synced = { row, groupRows: groupRows.length, allTimeRows: allTimeRows.length };
        break;
      }
      await sleep(500);
    }

    if (synced?.row?.score === 137 && synced.row.groupCode === group) {
      pass('late room join sync writes today\'s saved official score into the production room API', { group, playerId, score: synced.row.score, groupRows: synced.groupRows, allTimeRows: synced.allTimeRows });
    } else {
      fail('late room join sync writes today\'s saved official score into the production room API', { group, playerId, synced });
    }

    const state = await evaluate(client.send, 'late-room-join', 'desktop');
    if (state.bodyText.includes(username) && state.bodyText.includes('137')) {
      pass('late room join sync renders the synced player score on the room page', { group, username });
    } else {
      fail('late room join sync renders the synced player score on the room page', { group, username, text: state.bodyText.slice(0, 1200) });
    }

    if (client.events.exceptions.length) fail('late room join sync has no runtime exceptions', client.events.exceptions.slice(0, 3));
    else pass('late room join sync has no runtime exceptions');
  } finally {
    client.close();
    await closeTarget(target);
  }
}

async function auditLockedDailyState(viewport, { loggedIn = false } = {}) {
  const base = origin.replace(/\/$/, '');
  const label = `locked-${loggedIn ? 'logged-in' : 'logged-out'}`;
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${lockedDailyStorageScript({ loggedIn })}`,
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile });
    await client.send('Page.navigate', { url: `${base}/` });
    await waitForReady(client.send);
    await sleep(waitMs);

    const state = await evaluate(client.send, label, viewport.id);
    assertCommon(state, label, viewport.id);
    assertLockedState(state, viewport.id, label);

    if (loggedIn) {
      const commandOpened = await openCommandCenter(client.send);
      if (commandOpened.opened) {
        const commandState = await evaluate(client.send, label, `${viewport.id}-command`);
        if (/Logged in|Locked Audit|locked-audit@iqwars\.app/i.test(commandState.commandPanelText)) pass(`${viewport.id} ${label} command center preserves logged-in identity`);
        else fail(`${viewport.id} ${label} command center preserves logged-in identity`, { text: commandState.commandPanelText?.slice(0, 700) });
      } else {
        fail(`${viewport.id} ${label} command center opens from locked state`, commandOpened);
      }
      await closeCommandCenter(client.send);
    }

    const rankingsClick = await clickPrimaryButton(client.send, 'view rankings');
    if (rankingsClick.clicked) pass(`${viewport.id} ${label} rankings CTA is clickable`, rankingsClick);
    else fail(`${viewport.id} ${label} rankings CTA is clickable`, rankingsClick);
    const rankingsState = await evaluate(client.send, `${label}-rankings`, viewport.id);
    if (/\/rankings/.test(rankingsState.href) && /Create a friend room|Primary loop|World signal|Geography/i.test(rankingsState.bodyText)) pass(`${viewport.id} ${label} rankings CTA opens rankings`, { href: rankingsState.href });
    else fail(`${viewport.id} ${label} rankings CTA opens rankings`, { href: rankingsState.href, bodyText: rankingsState.bodyText.slice(0, 900) });

    if (client.events.exceptions.length) fail(`${viewport.id} ${label} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${label} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${label} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${label} has no blocking HTTP errors`);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const fileName = `${label}-${viewport.id}.png`;
    await writeFile(path.join(outDir, fileName), Buffer.from(screenshot.data, 'base64'));
    pass(`${viewport.id} ${label} screenshot captured`, { file: path.join(outDir, fileName) });
  } finally {
    client.close();
    await closeTarget(target);
  }
}

function inviteClipboardScript({ mode }) {
  const shouldReject = mode === 'denied';
  return `
    (() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text) => {
            window.localStorage.setItem('iqwars-audit-copied-text', String(text));
            window.__iqwarsCopiedText = String(text);
            ${shouldReject ? "return Promise.reject(new Error('audit clipboard denied'));" : 'return Promise.resolve();'}
          }
        }
      });
    })();
  `;
}

async function clickCreateRoomLink(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = (el) => (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
        const button = document.querySelector('.friend-panel .copy-link')
          || [...document.querySelectorAll('button.copy-link')].find((candidate) => /create.*copy link|copy link/i.test(text(candidate)));
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing create/copy button' });
        const beforeText = text(button);
        const disabled = button.disabled;
        if (!disabled) button.click();
        return JSON.stringify({ clicked: !disabled, disabled, beforeText });
      })()
    `,
    returnByValue: true,
  });
  await sleep(900);
  return JSON.parse(result.result.value);
}

async function inviteState(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const parse = (value, fallback) => {
          try { return JSON.parse(value || fallback); } catch { return JSON.parse(fallback); }
        };
        const groups = parse(window.localStorage.getItem('world-iq-groups'), '[]');
        const groupCode = clean(window.localStorage.getItem('world-iq-group-code'));
        const groupName = clean(window.localStorage.getItem('world-iq-group-name'));
        const copiedText = clean(window.localStorage.getItem('iqwars-audit-copied-text') || window.__iqwarsCopiedText);
        const button = document.querySelector('.friend-panel .copy-link');
        const fallback = document.querySelector('.friend-panel .copy-fallback-link');
        const confirmation = document.querySelector('.friend-panel .copy-confirmation');
        const pathCode = location.pathname.match(/^\\/g\\/(room-[a-z0-9-]+)/i)?.[1] || '';
        return JSON.stringify({
          href: location.href,
          pathCode,
          groupCode,
          groupName,
          groups: Array.isArray(groups) ? groups : [],
          copiedText,
          buttonText: clean(button?.textContent),
          fallbackText: clean(fallback?.textContent),
          confirmationText: clean(confirmation?.textContent),
          friendPanelText: clean(document.querySelector('.friend-panel')?.textContent).slice(0, 1200),
        });
      })()
    `,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

function assertInviteState(state, viewportId, mode) {
  const prefix = `${viewportId} invite ${mode}`;
  if (/^room-[a-z0-9-]+$/i.test(state.groupCode) && state.pathCode === state.groupCode) pass(`${prefix} creates a unique room URL`, { groupCode: state.groupCode, href: state.href });
  else fail(`${prefix} creates a unique room URL`, { groupCode: state.groupCode, pathCode: state.pathCode, href: state.href });

  if (Array.isArray(state.groups) && state.groups.length === 1 && state.groups[0]?.code === state.groupCode && state.groups[0]?.name === state.groupName) pass(`${prefix} persists the new group list entry`, { group: state.groups[0] });
  else fail(`${prefix} persists the new group list entry`, { groupCode: state.groupCode, groupName: state.groupName, groups: state.groups });

  const expectedUrl = `${origin.replace(/\/$/, '')}/g/${state.groupCode}`;
  if (mode === 'success') {
    if (state.copiedText === expectedUrl && /Link copied/i.test(state.buttonText) && /Group link copied/i.test(state.confirmationText)) pass(`${prefix} copies invite link and shows confirmation`, { copiedText: state.copiedText, buttonText: state.buttonText, confirmationText: state.confirmationText });
    else fail(`${prefix} copies invite link and shows confirmation`, { expectedUrl, copiedText: state.copiedText, buttonText: state.buttonText, confirmationText: state.confirmationText, panel: state.friendPanelText });
  } else {
    if (state.copiedText === expectedUrl && /Link ready/i.test(state.buttonText) && state.fallbackText === expectedUrl) pass(`${prefix} exposes fallback URL when clipboard is denied`, { fallbackText: state.fallbackText, buttonText: state.buttonText });
    else fail(`${prefix} exposes fallback URL when clipboard is denied`, { expectedUrl, copiedText: state.copiedText, buttonText: state.buttonText, fallbackText: state.fallbackText, panel: state.friendPanelText });
  }
}

async function auditCreateCopyRoomLink(viewport, { mode = 'success' } = {}) {
  const base = origin.replace(/\/$/, '');
  const label = `invite-${mode}`;
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${inviteClipboardScript({ mode })}`,
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile });
    await client.send('Page.navigate', { url: `${base}/` });
    await waitForReady(client.send);
    await sleep(waitMs);

    const state = await evaluate(client.send, label, viewport.id);
    assertCommon(state, label, viewport.id);
    const clicked = await clickCreateRoomLink(client.send);
    if (clicked.clicked) pass(`${viewport.id} ${label} create/copy CTA is one-tap clickable`, clicked);
    else fail(`${viewport.id} ${label} create/copy CTA is one-tap clickable`, clicked);
    const invite = await inviteState(client.send);
    assertInviteState(invite, viewport.id, mode);

    if (client.events.exceptions.length) fail(`${viewport.id} ${label} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${label} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${label} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${label} has no blocking HTTP errors`);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const fileName = `${label}-${viewport.id}.png`;
    await writeFile(path.join(outDir, fileName), Buffer.from(screenshot.data, 'base64'));
    pass(`${viewport.id} ${label} screenshot captured`, { file: path.join(outDir, fileName) });
  } finally {
    client.close();
    await closeTarget(target);
  }
}

await mkdir(outDir, { recursive: true });
roomFixture = await loadRoomFixture();
await ensureChrome();
await auditLateRoomJoinSync();
roomFixture = await loadRoomFixture();

for (const viewport of viewports) {
  await auditLockedDailyState(viewport, { loggedIn: false });
  await auditLockedDailyState(viewport, { loggedIn: true });
  await auditCreateCopyRoomLink(viewport, { mode: 'success' });
  await auditCreateCopyRoomLink(viewport, { mode: 'denied' });
  for (const route of routes) {
    await auditRoute(route, viewport);
  }
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  origin,
  outDir,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map(({ message, details }) => ({ message, details })),
}, null, 2));

if (failed.length) process.exitCode = 1;
