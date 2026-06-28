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
const officialQuestionCount = 12;
const playerCookieName = 'iqwars_player_api_key';

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
        'world-iq-recursiv-account',
        'world-iq-player-settings'
      ].forEach((key) => window.localStorage.removeItem(key));
    })();
  `;
}

function officialWriteStubScript() {
  return `
    (() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
        const method = String(init && init.method || input && input.method || 'GET').toUpperCase();
        if (method === 'POST' && /\\/api\\/attempts(?:$|[?#])/.test(url)) {
          let body = {};
          try { body = JSON.parse(init.body || '{}'); } catch {}
          return new Response(JSON.stringify({ accepted: true, attempt: body }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'POST' && /\\/api\\/leaderboards(?:$|[?#])/.test(url)) {
          let body = {};
          try { body = JSON.parse(init.body || '{}'); } catch {}
          const entry = {
            id: 'visual-full-run:' + (body.day || 'today') + ':' + (body.playerId || 'player'),
            day: body.day || '',
            playerId: body.playerId || 'visual-full-run',
            displayName: body.displayName || 'Visual Full Run',
            username: body.username || 'visual_full_run',
            groupCode: body.groupCode || null,
            groupName: body.groupName || null,
            score: body.score || 100,
            rank: body.rank || '#50,000',
            percentile: body.percentile || 50,
            correct: body.correct || 0,
            total: body.total || ${officialQuestionCount},
            beatAi: body.beatAi || 0,
            elapsedMs: body.elapsedMs || null,
            speedBonus: body.speedBonus || 0,
            timestamp: Date.now(),
            geo: body.geo || null
          };
          return new Response(JSON.stringify({
            accepted: true,
            entry,
            global: [entry],
            group: entry.groupCode ? [entry] : [],
            groupAllTime: entry.groupCode ? [entry] : [],
            geography: { countries: [], cities: [], towns: [] }
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(input, init);
      };
    })();
  `;
}

function soundAuditScript({ soundEnabled = true } = {}) {
  return `
    (() => {
      const pad = (value) => String(value).padStart(2, '0');
      const now = new Date();
      const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      window.localStorage.setItem('world-iq-player-settings', JSON.stringify({ soundEnabled: ${soundEnabled ? 'true' : 'false'} }));
      window.localStorage.setItem('world-iq-player-id', ${JSON.stringify(`sound-audit-${soundEnabled ? 'on' : 'off'}`)});
      window.localStorage.setItem('world-iq-question-order-v3:world', JSON.stringify({
        day,
        mode: 'world',
        order: ['world-01', 'world-02', 'world-03', 'world-04', 'world-05', 'world-06', 'world-07', 'world-08', 'world-09', 'world-10', 'world-11', 'world-12']
      }));
      window.__iqwarsAudioEvents = [];
      class FakeAudioParam {
        constructor(owner, name) { this.owner = owner; this.name = name; }
        setValueAtTime(value, time) {
          if (this.name === 'frequency') this.owner.frequencyValue = Number(value);
          return value;
        }
        exponentialRampToValueAtTime(value, time) {
          if (this.name === 'frequency' && !this.owner.frequencyValue) this.owner.frequencyValue = Number(value);
          return value;
        }
      }
      class FakeNode {
        connect() { return this; }
        disconnect() { return undefined; }
      }
      class FakeGain extends FakeNode {
        constructor() {
          super();
          this.gain = new FakeAudioParam(this, 'gain');
        }
      }
      class FakeFilter extends FakeNode {
        constructor() {
          super();
          this.type = 'lowpass';
          this.frequency = new FakeAudioParam(this, 'frequency');
        }
      }
      class FakeOscillator extends FakeNode {
        constructor() {
          super();
          this.type = 'sine';
          this.frequencyValue = 0;
          this.frequency = new FakeAudioParam(this, 'frequency');
          this.onended = null;
        }
        start(time) {
          window.__iqwarsAudioEvents.push({ type: this.type, frequency: this.frequencyValue, time: Number(time || 0) });
        }
        stop() {
          if (typeof this.onended === 'function') window.setTimeout(() => this.onended(), 0);
        }
      }
      class FakeAudioContext {
        constructor() {
          this.currentTime = 0;
          this.state = 'running';
          this.destination = {};
        }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createGain() { return new FakeGain(); }
        createBiquadFilter() { return new FakeFilter(); }
        createOscillator() { return new FakeOscillator(); }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: FakeAudioContext });
    })();
  `;
}

function loggedInSettingsStorageScript() {
  return `
    (() => {
      window.localStorage.setItem('world-iq-player-id', 'settings-matrix-audit');
      window.localStorage.setItem('world-iq-player-name', 'Settings Matrix Audit');
      window.localStorage.setItem('world-iq-player-username', 'settings_matrix');
      window.localStorage.setItem('world-iq-recursiv-account', JSON.stringify({
        email: 'settings-matrix@iqwars.app',
        name: 'Settings Matrix',
        updatedAt: Date.now()
      }));
      window.localStorage.setItem('world-iq-player-settings', JSON.stringify({
        profilePublic: true,
        showLocation: false,
        showXBadge: false,
        showScoreHistory: true,
        showAgentActivity: false,
        labModesEnabled: false,
        soundEnabled: true,
        reducedMotion: false,
        highContrast: false,
        dailyReminder: false,
        analyticsEnabled: true,
        emailUpdates: false,
        shareScoreByDefault: true
      }));
    })();
  `;
}

function loggedInLogoutStorageScript() {
  return `
    (() => {
      window.localStorage.setItem('world-iq-player-id', 'logout-flow-audit');
      window.localStorage.setItem('world-iq-player-name', 'Logout Flow Audit');
      window.localStorage.setItem('world-iq-player-username', 'logout_flow');
      window.localStorage.setItem('world-iq-recursiv-account', JSON.stringify({
        email: 'logout-flow@iqwars.app',
        name: 'Logout Flow',
        updatedAt: Date.now()
      }));
      window.localStorage.setItem('world-iq-official-history', JSON.stringify([
        { day: '2026-06-25', score: 121, rank: '#130,000', percentile: 88, correct: 8, total: 12, beatAi: 1, elapsedMs: 420000, speedBonus: 0, timestamp: Date.now() - 172800000 },
        { day: '2026-06-26', score: 127, rank: '#90,000', percentile: 92, correct: 9, total: 12, beatAi: 2, elapsedMs: 390000, speedBonus: 1, timestamp: Date.now() - 86400000 },
        { day: '2026-06-27', score: 132, rank: '#55,000', percentile: 95, correct: 10, total: 12, beatAi: 2, elapsedMs: 360000, speedBonus: 2, timestamp: Date.now() }
      ]));
    })();
  `;
}

function loggedInAgentVisibilityStorageScript({ showAgentActivity = false } = {}) {
  return `
    (() => {
      window.localStorage.setItem('world-iq-player-id', ${JSON.stringify(showAgentActivity ? 'agent-visible-audit' : 'agent-hidden-audit')});
      window.localStorage.setItem('world-iq-player-name', ${JSON.stringify(showAgentActivity ? 'Agent Visible Audit' : 'Agent Hidden Audit')});
      window.localStorage.setItem('world-iq-player-username', ${JSON.stringify(showAgentActivity ? 'agent_visible_audit' : 'agent_hidden_audit')});
      window.localStorage.setItem('world-iq-recursiv-account', JSON.stringify({
        email: ${JSON.stringify(showAgentActivity ? 'agent-visible@iqwars.app' : 'agent-hidden@iqwars.app')},
        name: ${JSON.stringify(showAgentActivity ? 'Agent Visible' : 'Agent Hidden')},
        updatedAt: Date.now()
      }));
      window.localStorage.setItem('world-iq-player-settings', JSON.stringify({
        profilePublic: true,
        showLocation: false,
        showXBadge: false,
        showScoreHistory: true,
        showAgentActivity: ${showAgentActivity ? 'true' : 'false'},
        labModesEnabled: false,
        soundEnabled: true,
        reducedMotion: false,
        highContrast: false,
        dailyReminder: false,
        analyticsEnabled: true,
        emailUpdates: false,
        shareScoreByDefault: true
      }));
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

function profileHistoryStorageScript() {
  return `
    (() => {
      const pad = (value) => String(value).padStart(2, '0');
      const dayKey = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const now = new Date();
      const scores = [118, 121, 123, 126, 128, 131, 133, 135, 136, 138, 139, 141, 142, 144];
      const records = scores.map((score, index) => {
        const offset = scores.length - 1 - index;
        const date = new Date(now);
        date.setDate(now.getDate() - offset);
        const correct = score >= 140 ? 11 : score >= 132 ? 10 : score >= 124 ? 9 : 8;
        return {
          day: dayKey(date),
          score,
          rank: score >= 140 ? '#12,000' : score >= 132 ? '#30,000' : score >= 124 ? '#80,000' : '#150,000',
          percentile: Math.min(99, 82 + index),
          correct,
          total: 12,
          beatAi: Math.max(1, Math.min(4, correct - 7)),
          elapsedMs: 520000 - index * 12000,
          speedBonus: Math.max(0, Math.min(5, Math.round(index / 3))),
          timestamp: Date.now() - offset * 86400000
        };
      });
      const latest = records[records.length - 1];
      window.localStorage.setItem('world-iq-player-id', 'profile-history-audit');
      window.localStorage.setItem('world-iq-player-name', 'Profile History Audit');
      window.localStorage.setItem('world-iq-official-history', JSON.stringify(records));
      window.localStorage.setItem('world-iq-official-rank', JSON.stringify(latest));
      window.localStorage.setItem('world-iq-play-usage', JSON.stringify({ day: latest.day, count: 1 }));
    })();
  `;
}

function groupSidebarStorageScript() {
  const activeCode = 'room-audit-07';
  return `
    (() => {
      const now = Date.now();
      const groups = Array.from({ length: 30 }, (_, index) => {
        const n = String(index + 1).padStart(2, '0');
        return {
          code: 'room-audit-' + n,
          name: 'Audit Circle ' + n,
          createdAt: now - ((index + 2) * 86400000),
          lastActiveAt: now - ((index + 2) * 60000)
        };
      });
      window.localStorage.setItem('world-iq-groups', JSON.stringify(groups));
      window.localStorage.setItem('world-iq-group-code', ${JSON.stringify(activeCode)});
      window.localStorage.setItem('world-iq-group-name', 'Audit Circle 07');
    })();
  `;
}

function spanishLocaleScript() {
  return `
    (() => {
      Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'es-ES' });
      Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['es-ES', 'es'] });
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
      expression: "document.readyState === 'complete' && Boolean(document.querySelector('.runner-panel, .leaderboard, .account-gate, .profile-page, .settings-panel'))",
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
      const main = document.querySelector('main');
      const matrix = document.querySelector('.matrix');
      const questionPad = document.querySelector('.question-pad');
      const options = [...document.querySelectorAll('.option')];
      const optionTiles = [...document.querySelectorAll('.option .tile')];
      const lockButton = [...document.querySelectorAll('button.primary')].find((button) => /lock answer|next question|see score|fijar respuesta|siguiente pregunta|ver puntaje/i.test(text(button))) || null;
      const menuButton = document.querySelector('.command-toggle');
      const commandPanel = document.querySelector('.command-panel');
      const commandProfile = document.querySelector('.command-profile');
      const commandRoomCard = document.querySelector('.command-room-card');
      const commandScroll = document.querySelector('.command-scroll');
      const closeCommand = document.querySelector('.close-command');
      const commandNavButtons = [...document.querySelectorAll('.command-grid button')];
      const answerFeedback = document.querySelector('.answer-feedback');
      const progressRow = document.querySelector('.progress-row');
      const questionHead = document.querySelector('.question-head');
      const resultPanel = document.querySelector('.runner-panel.result');
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
      const socialBoards = [...document.querySelectorAll('.social-board')].map((board) => ({
        kicker: text(board.querySelector('.kicker')),
        title: text(board.querySelector('h2')),
        text: text(board).slice(0, 1600),
        rows: [...board.querySelectorAll('.leaderboard-row')].map((row) => text(row).slice(0, 500)),
        rowCount: board.querySelectorAll('.leaderboard-row').length,
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
      const profilePanel = document.querySelector('.profile-panel');
      const profileStats = [...document.querySelectorAll('.profile-panel .profile-stats div')].map((item) => ({
        label: text(item.querySelector('span')),
        value: text(item.querySelector('strong')),
        rect: rect(item),
      }));
      const profileHistoryDays = [...document.querySelectorAll('.profile-panel .history-day')].map((item) => ({
        day: text(item.querySelector('span')),
        score: text(item.querySelector('strong')),
        bar: rect(item.querySelector('i')),
        rect: rect(item),
      }));
      const settingToggles = [...document.querySelectorAll('.setting-toggle')].map((item) => {
        const input = item.querySelector('input');
        return {
          key: item.getAttribute('data-setting') || '',
          label: text(item.querySelector('strong')),
          description: text(item.querySelector('em')),
          checked: Boolean(input?.checked),
          rect: rect(item),
        };
      });
      let storedSettings = null;
      try {
        storedSettings = JSON.parse(window.localStorage.getItem('world-iq-player-settings') || 'null');
      } catch {
        storedSettings = null;
      }
      const firstSymbol = document.querySelector('.symbol');
      const runnerStyle = runner ? getComputedStyle(runner) : null;
      const optionStyle = options[0] ? getComputedStyle(options[0]) : null;
      const symbolStyle = firstSymbol ? getComputedStyle(firstSymbol) : null;
      const settingsPanelStyle = document.querySelector('.settings-panel') ? getComputedStyle(document.querySelector('.settings-panel')) : null;
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
        htmlLang: document.documentElement.lang || '',
        htmlLocale: document.documentElement.dataset.locale || '',
        mainLang: document.querySelector('main')?.getAttribute('lang') || '',
        mainLocale: document.querySelector('main')?.getAttribute('data-locale') || '',
        mainClassName: String(main?.className || ''),
        mainDataset: main ? { ...main.dataset } : {},
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
        commandNavLabels: commandNavButtons.map(text),
        answerFeedback: rect(answerFeedback),
        answerFeedbackText: text(answerFeedback),
        progressText: text(progressRow),
        questionTitle: text(questionHead?.querySelector('h2')),
        questionDifficulty: text(questionHead?.querySelector('span')),
        resultPanel: rect(resultPanel),
        resultText: text(resultPanel).slice(0, 1800),
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
        socialBoards,
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
        profilePanel: rect(profilePanel),
        profilePanelClass: String(profilePanel?.className || ''),
        profilePanelText: text(profilePanel).slice(0, 1600),
        profileStats,
        profileHistoryDays,
        settingToggles,
        storedSettings,
        settingsEffects: {
          symbolAnimationName: symbolStyle?.animationName || '',
          symbolAnimationDuration: symbolStyle?.animationDuration || '',
          optionTransitionDuration: optionStyle?.transitionDuration || '',
          runnerBorderColor: runnerStyle?.borderColor || '',
          settingsPanelBorderColor: settingsPanelStyle?.borderColor || '',
        },
        visibleRoomRecords: /Room records|All-time room highscores|Best scores ever in this room/i.test(text(document.body)),
        visibleRoomHighscore: /Ongoing room highscore|Ongoing room record|Room highscore|all-time room highscore|ongoing highscore race/i.test(text(document.body)),
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

async function clickOptionOnly(send, index = 0) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const options = [...document.querySelectorAll('.option')];
        const option = options[${Number(index)}];
        if (!option) return JSON.stringify({ clicked: false, reason: 'missing option', index: ${Number(index)}, optionCount: options.length });
        const disabled = option.disabled;
        if (!disabled) option.click();
        return JSON.stringify({ clicked: !disabled, disabled, index: ${Number(index)}, optionCount: options.length });
      })()
    `,
    returnByValue: true,
  });
  await sleep(350);
  return JSON.parse(result.result.value);
}

async function clickLockAnswer(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const lock = [...document.querySelectorAll('button.primary')].find((button) => /lock answer|fijar respuesta/i.test(clean(button.textContent)));
        if (!lock) return JSON.stringify({ clicked: false, reason: 'missing lock' });
        const disabled = lock.disabled;
        if (!disabled) lock.click();
        return JSON.stringify({ clicked: !disabled, disabled, text: clean(lock.textContent) });
      })()
    `,
    returnByValue: true,
  });
  await sleep(700);
  return JSON.parse(result.result.value);
}

async function clearAudioEvents(send) {
  await send('Runtime.evaluate', {
    expression: "window.__iqwarsAudioEvents = []; true",
    returnByValue: true,
  }).catch(() => null);
}

async function audioState(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => JSON.stringify({
        events: Array.isArray(window.__iqwarsAudioEvents) ? window.__iqwarsAudioEvents : [],
        bodyText: (document.body.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 700)
      }))()
    `,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

function hasFrequencies(state, expected) {
  const actual = (state.events || []).map((event) => Number(event.frequency)).filter(Number.isFinite);
  return expected.every((frequency) => actual.some((value) => Math.abs(value - frequency) <= 1));
}

function assertAudioCue(state, label, expected) {
  if (hasFrequencies(state, expected)) pass(`${label} emits expected audio cue`, { expected, actual: (state.events || []).map((event) => event.frequency) });
  else fail(`${label} emits expected audio cue`, { expected, events: state.events, bodyText: state.bodyText });
}

function assertNoAudioCue(state, label) {
  if (!state.events || state.events.length === 0) pass(`${label} stays silent when sound is disabled`);
  else fail(`${label} stays silent when sound is disabled`, { events: state.events, bodyText: state.bodyText });
}

async function pointerClickButton(send, matchText) {
  const pointResult = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wanted = ${JSON.stringify(matchText)}.toLowerCase();
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const matches = [...document.querySelectorAll('button')].filter((candidate) => clean(candidate.textContent).toLowerCase().includes(wanted));
        const isVisible = (candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
        };
        const button = matches.find(isVisible) || matches[0];
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing button', wanted });
        button.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = button.getBoundingClientRect();
        return JSON.stringify({ clicked: true, text: clean(button.textContent), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      })()
    `,
    returnByValue: true,
  });
  const point = JSON.parse(pointResult.result.value);
  if (!point.clicked) return point;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }).catch(() => null);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => null);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => null);
  await sleep(500);
  return point;
}

async function toggleAllVisibleSettings(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const rows = [...document.querySelectorAll('.setting-toggle')];
        const before = rows.map((row) => {
          const input = row.querySelector('input');
          return { key: row.getAttribute('data-setting') || '', checked: Boolean(input?.checked) };
        });
        for (const row of rows) {
          const input = row.querySelector('input');
          if (input) input.click();
        }
        const after = rows.map((row) => {
          const input = row.querySelector('input');
          return { key: row.getAttribute('data-setting') || '', checked: Boolean(input?.checked) };
        });
        let storedSettings = null;
        try {
          storedSettings = JSON.parse(window.localStorage.getItem('world-iq-player-settings') || 'null');
        } catch {
          storedSettings = null;
        }
        return JSON.stringify({ clicked: rows.length, before, after, storedSettings });
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

async function setAuditPlayerCookie(send, base) {
  const result = await send('Network.setCookie', {
    url: base,
    name: playerCookieName,
    value: 'audit-player-cookie',
    path: '/',
    httpOnly: true,
    secure: /^https:/i.test(base),
    sameSite: 'Lax',
  });
  return Boolean(result.success);
}

async function playerCookiePresent(send, base) {
  const result = await send('Network.getCookies', { urls: [base] });
  return (result.cookies || []).some((cookie) => cookie.name === playerCookieName && cookie.value);
}

async function clickLogout(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const button = document.querySelector('.logout-action') || [...document.querySelectorAll('button')].find((candidate) => /^logout$/i.test(clean(candidate.textContent)));
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing logout button' });
        const disabled = button.disabled;
        if (!disabled) button.click();
        return JSON.stringify({ clicked: !disabled, disabled, text: clean(button.textContent) });
      })()
    `,
    returnByValue: true,
  });
  await sleep(900);
  return JSON.parse(result.result.value);
}

async function loggedInAccountState(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const command = document.querySelector('.command-panel');
        const menu = document.querySelector('.command-toggle');
        const localAccount = window.localStorage.getItem('world-iq-recursiv-account');
        return JSON.stringify({
          href: location.href,
          localAccount,
          commandOpen: Boolean(command),
          commandText: clean(command?.textContent).slice(0, 1600),
          commandToggleClass: String(menu?.className || ''),
          commandAriaLabel: menu?.getAttribute('aria-label') || '',
          bodyText: clean(document.body.textContent).slice(0, 2200),
        });
      })()
    `,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
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

  if (state.commandProfile && /Score|Puntaje|Logged|Sesion|sesion|Guest|Unrated|Sin calificar/i.test(state.commandPanelText)) pass(`${prefix} command center exposes identity and score`);
  else fail(`${prefix} command center exposes identity and score`, { text: state.commandPanelText?.slice(0, 500) });

  if (state.commandNavButtonCount >= 5 && /Today|Rankings|About|Research|Blog/i.test(state.commandPanelText)) pass(`${prefix} command center exposes primary navigation`, { buttons: state.commandNavButtonCount });
  else fail(`${prefix} command center exposes primary navigation`, { buttons: state.commandNavButtonCount, text: state.commandPanelText?.slice(0, 500) });

  if (state.commandRoomCard && /Friend groups|Grupos de amigos|No active group|Sin grupo activo|Active private group|Grupo privado activo|Create|Crear/i.test(state.commandPanelText)) pass(`${prefix} command center exposes friend-group controls`);
  else fail(`${prefix} command center exposes friend-group controls`, { text: state.commandPanelText?.slice(0, 500) });
}

function globalSocialBoard(state) {
  return (state.socialBoards || []).find((board) => /Global board|The daily global IQ WARS board/i.test(`${board.kicker} ${board.title}`)) || null;
}

function assertAgentVisibilityState(state, viewportId, label, { expectAgents }) {
  const prefix = `${viewportId} ${label}`;
  const board = globalSocialBoard(state);
  if (board && /The daily global IQ WARS board|Global board/i.test(`${board.kicker} ${board.title}`)) pass(`${prefix} renders the global leaderboard board`, { title: board.title, rows: board.rowCount });
  else {
    fail(`${prefix} renders the global leaderboard board`, { boards: state.socialBoards });
    return;
  }

  const agentRows = (board.rows || []).filter((row) => /@agent_|Agent\s+[A-Z]/i.test(row));
  if (expectAgents) {
    if (agentRows.length > 0) pass(`${prefix} shows seeded test agents only after the setting is enabled`, { agentRows: agentRows.slice(0, 3) });
    else fail(`${prefix} shows seeded test agents only after the setting is enabled`, { rows: board.rows?.slice(0, 8), board: board.text.slice(0, 900) });
  } else if (agentRows.length === 0) {
    pass(`${prefix} keeps seeded test agents hidden by default`, { rows: board.rowCount });
  } else {
    fail(`${prefix} keeps seeded test agents hidden by default`, { agentRows: agentRows.slice(0, 5), rows: board.rows?.slice(0, 8) });
  }
}

function assertSpanishLocale(state, viewportId, label) {
  const prefix = `${viewportId} ${label}`;
  const body = state.bodyText || '';
  const command = state.commandPanelText || '';
  if (state.htmlLang === 'es' && state.htmlLocale === 'es' && state.mainLang === 'es' && state.mainLocale === 'es') {
    pass(`${prefix} auto-detects Spanish locale in document markers`, { htmlLang: state.htmlLang, htmlLocale: state.htmlLocale, mainLang: state.mainLang, mainLocale: state.mainLocale });
  } else {
    fail(`${prefix} auto-detects Spanish locale in document markers`, { htmlLang: state.htmlLang, htmlLocale: state.htmlLocale, mainLang: state.mainLang, mainLocale: state.mainLocale });
  }

  if (/IQ WARS de hoy|Puntaje en vivo|Respondidas|Fijar respuesta|Conteo aditivo/i.test(body)) {
    pass(`${prefix} renders translated playable home copy`, { sample: body.slice(0, 700) });
  } else {
    fail(`${prefix} renders translated playable home copy`, { sample: body.slice(0, 900) });
  }

  if (!/Lock answer|Live score|Answered|Open command center|Friend groups|Create a private room/i.test(`${body} ${command}`)) {
    pass(`${prefix} hides obvious English core UI strings in Spanish locale`);
  } else {
    fail(`${prefix} hides obvious English core UI strings in Spanish locale`, { body: body.slice(0, 900), command: command.slice(0, 900) });
  }

  if (/Barra lateral izquierda|Puntaje|Sin sesion|Navegacion primaria|Grupos de amigos|Crear sala privada|Hoy|Investigacion/i.test(command)) {
    pass(`${prefix} renders translated command-center navigation and friend-group copy`, { command: command.slice(0, 900) });
  } else {
    fail(`${prefix} renders translated command-center navigation and friend-group copy`, { command: command.slice(0, 1200) });
  }
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

function visualDifficultyRank(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('calibration')) return 0;
  if (value.includes('basic') || value.includes('foundation')) return 1;
  if (value.includes('core') || value.includes('adaptive')) return 2;
  if (value.includes('advanced')) return 3;
  if (value.includes('hard') || value.includes('frontier')) return 4;
  if (value.includes('elite')) return 5;
  return 3;
}

function assertFullOfficialRun(questionStates, resultState, viewportId) {
  const prefix = `${viewportId} full official run`;
  const questions = questionStates.slice(0, officialQuestionCount);
  const titles = questions.map((state) => state.questionTitle).filter(Boolean);
  const difficulties = questions.map((state) => state.questionDifficulty).filter(Boolean);
  const ranks = difficulties.map(visualDifficultyRank);

  if (questions.length === officialQuestionCount && titles.length === officialQuestionCount) pass(`${prefix} renders all 12 official questions`, { titles });
  else fail(`${prefix} renders all 12 official questions`, { count: questions.length, titles, difficulties });

  if (new Set(titles).size === titles.length) pass(`${prefix} uses unique question titles through the run`, { titles });
  else fail(`${prefix} uses unique question titles through the run`, { titles });

  if (ranks[0] <= 2) pass(`${prefix} starts with an approachable calibration/core item`, { first: difficulties[0] });
  else fail(`${prefix} starts with an approachable calibration/core item`, { difficulties, ranks });

  if (ranks.slice(0, 6).every((rank) => rank <= 2)) pass(`${prefix} keeps the first half in calibration/core territory`, { difficulties: difficulties.slice(0, 6) });
  else fail(`${prefix} keeps the first half in calibration/core territory`, { difficulties, ranks });

  const rest = ranks.slice(1);
  if (rest.every((rank, index) => index === 0 || rest[index - 1] <= rank)) pass(`${prefix} ramps upward after the starter`, { difficulties });
  else fail(`${prefix} ramps upward after the starter`, { difficulties, ranks });

  if (ranks.slice(-3).some((rank) => rank >= 4)) pass(`${prefix} ends with a hard/frontier challenge`, { difficulties: difficulties.slice(-3) });
  else fail(`${prefix} ends with a hard/frontier challenge`, { difficulties, ranks });

  if (resultState.resultPanel && /Official rank locked|Today updated your developing IQ WARS profile/i.test(resultState.resultText)) pass(`${prefix} reaches the official result panel`, { result: resultState.resultText.slice(0, 500) });
  else fail(`${prefix} reaches the official result panel`, { result: resultState.resultText, bodyText: resultState.bodyText.slice(0, 900) });

  if (/Reasoning score|official time|estimated rank|IQ WARS is a competitive visual reasoning game/i.test(resultState.resultText)) pass(`${prefix} result explains score, time, rank, and caveat`, { result: resultState.resultText.slice(0, 500) });
  else fail(`${prefix} result explains score, time, rank, and caveat`, { result: resultState.resultText });

  if (/\/12\s+correct/i.test(resultState.resultText)) pass(`${prefix} result records a complete 12-answer baseline`, { result: resultState.resultText.slice(0, 500) });
  else fail(`${prefix} result records a complete 12-answer baseline`, { result: resultState.resultText });
}

function lockedCellValue(state, label) {
  const cell = (state.lockedScoreCells || []).find((item) => item.label.toLowerCase() === label.toLowerCase());
  return cell ? cell.value : null;
}

function profileStatValue(state, label) {
  const stat = (state.profileStats || []).find((item) => item.label.toLowerCase() === label.toLowerCase());
  return stat ? stat.value : null;
}

function settingChecked(state, key) {
  const setting = (state.settingToggles || []).find((item) => item.key === key);
  return setting ? setting.checked : null;
}

function assertSettingsInitial(state, viewportId) {
  const prefix = `${viewportId} settings matrix`;
  if (/Standard controls for a public daily game/i.test(state.bodyText) && (state.settingToggles || []).length >= 12) pass(`${prefix} renders the standard logged-in settings surface`, { count: state.settingToggles.length });
  else fail(`${prefix} renders the standard logged-in settings surface`, { count: state.settingToggles?.length, text: state.bodyText.slice(0, 900) });

  const expectedDefaults = {
    profilePublic: true,
    showLocation: false,
    showScoreHistory: true,
    soundEnabled: true,
    labModesEnabled: false,
    reducedMotion: false,
    highContrast: false,
    shareScoreByDefault: true,
    dailyReminder: false,
    emailUpdates: false,
    analyticsEnabled: true,
    showAgentActivity: false,
  };
  const mismatches = Object.entries(expectedDefaults).filter(([key, expected]) => settingChecked(state, key) !== expected);
  if (!mismatches.length) pass(`${prefix} loads expected default privacy/game settings`, expectedDefaults);
  else fail(`${prefix} loads expected default privacy/game settings`, { mismatches, toggles: state.settingToggles });

  if (state.mainDataset?.highContrast === 'false' && state.mainDataset?.reducedMotion === 'false' && state.mainDataset?.soundEnabled === 'true' && state.mainDataset?.analyticsEnabled === 'true') pass(`${prefix} exposes default shell state for accessibility and privacy`, state.mainDataset);
  else fail(`${prefix} exposes default shell state for accessibility and privacy`, { dataset: state.mainDataset, className: state.mainClassName });
}

function assertSettingsPersisted(state, viewportId) {
  const prefix = `${viewportId} settings matrix`;
  const expected = {
    profilePublic: false,
    showLocation: true,
    showScoreHistory: false,
    soundEnabled: false,
    labModesEnabled: true,
    reducedMotion: true,
    highContrast: true,
    shareScoreByDefault: false,
    dailyReminder: true,
    emailUpdates: true,
    analyticsEnabled: false,
    showAgentActivity: true,
  };
  const domMismatches = Object.entries(expected).filter(([key, value]) => settingChecked(state, key) !== value);
  if (!domMismatches.length) pass(`${prefix} persists every visible toggle after reload`, expected);
  else fail(`${prefix} persists every visible toggle after reload`, { domMismatches, toggles: state.settingToggles });

  const storageMismatches = Object.entries(expected).filter(([key, value]) => state.storedSettings?.[key] !== value);
  if (!storageMismatches.length) pass(`${prefix} writes every visible toggle to local settings storage`, expected);
  else fail(`${prefix} writes every visible toggle to local settings storage`, { storageMismatches, storedSettings: state.storedSettings });

  if (state.mainDataset?.highContrast === 'true' && state.mainDataset?.reducedMotion === 'true' && state.mainDataset?.soundEnabled === 'false' && state.mainDataset?.analyticsEnabled === 'false') pass(`${prefix} exposes persisted shell state for high contrast, reduced motion, sound, and analytics`, state.mainDataset);
  else fail(`${prefix} exposes persisted shell state for high contrast, reduced motion, sound, and analytics`, { dataset: state.mainDataset, className: state.mainClassName });
}

function assertSettingsEffects(state, viewportId) {
  const prefix = `${viewportId} settings matrix`;
  if (/settings-high-contrast/.test(state.mainClassName) && /settings-reduced-motion/.test(state.mainClassName) && /settings-sound-off/.test(state.mainClassName) && /settings-analytics-off/.test(state.mainClassName)) pass(`${prefix} applies settings classes to the app shell`, { className: state.mainClassName });
  else fail(`${prefix} applies settings classes to the app shell`, { className: state.mainClassName, dataset: state.mainDataset });

  if (state.settingsEffects?.symbolAnimationName === 'none') pass(`${prefix} disables background symbol animation when reduced motion is enabled`, state.settingsEffects);
  else fail(`${prefix} disables background symbol animation when reduced motion is enabled`, state.settingsEffects);

  const border = state.settingsEffects?.runnerBorderColor || '';
  const alpha = Number(border.match(/rgba\(\s*255,\s*255,\s*255,\s*([0-9.]+)\s*\)/)?.[1] || 0);
  if (border === 'rgb(255, 255, 255)' || alpha >= 0.2) pass(`${prefix} strengthens panel borders when high contrast is enabled`, { border });
  else fail(`${prefix} strengthens panel borders when high contrast is enabled`, state.settingsEffects);
}

function assertIqProfileHistory(state, viewportId) {
  const prefix = `${viewportId} profile history`;
  if (state.profilePanel && /Developing IQ/i.test(state.profilePanelText)) pass(`${prefix} renders the developing IQ profile panel`, state.profilePanel);
  else fail(`${prefix} renders the developing IQ profile panel`, { rect: state.profilePanel, text: state.profilePanelText?.slice(0, 900) });

  if (/score-evidence-high/.test(state.profilePanelClass)) pass(`${prefix} uses high-evidence visual state after 168 answers`, { className: state.profilePanelClass });
  else fail(`${prefix} uses high-evidence visual state after 168 answers`, { className: state.profilePanelClass, text: state.profilePanelText?.slice(0, 900) });

  if (/137 rolling score/i.test(state.profilePanelText) && /Stable profile/i.test(state.profilePanelText) && /168 answers completed/i.test(state.profilePanelText)) pass(`${prefix} explains stable rolling profile confidence`, { text: state.profilePanelText.slice(0, 500) });
  else fail(`${prefix} explains stable rolling profile confidence`, { text: state.profilePanelText?.slice(0, 900) });

  if (profileStatValue(state, 'rolling IQ') === '137') pass(`${prefix} renders weighted rolling IQ score`, { expected: 137 });
  else fail(`${prefix} renders weighted rolling IQ score`, { stats: state.profileStats });

  if (profileStatValue(state, 'answers completed') === '168' && profileStatValue(state, 'official days') === '14') pass(`${prefix} renders mature answer and official-day counts`, { answers: 168, days: 14 });
  else fail(`${prefix} renders mature answer and official-day counts`, { stats: state.profileStats });

  if (profileStatValue(state, 'best score') === '144' && profileStatValue(state, 'trend') === '+2 vs previous day') pass(`${prefix} renders best score and latest trend`, { best: 144, trend: '+2 vs previous day' });
  else fail(`${prefix} renders best score and latest trend`, { stats: state.profileStats });

  if ((state.profileHistoryDays || []).length === 14) pass(`${prefix} renders 14 recent official score bars`, { count: state.profileHistoryDays.length });
  else fail(`${prefix} renders 14 recent official score bars`, { count: state.profileHistoryDays?.length, days: state.profileHistoryDays });

  const firstScore = state.profileHistoryDays?.[0]?.score;
  const lastScore = state.profileHistoryDays?.[state.profileHistoryDays.length - 1]?.score;
  if (firstScore === '118' && lastScore === '144') pass(`${prefix} preserves chronological score history`, { firstScore, lastScore });
  else fail(`${prefix} preserves chronological score history`, { firstScore, lastScore, days: state.profileHistoryDays });
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
  if (metricValue(state, 'Today') === String(roomFixture.todayCount) || metricValue(state, 'Daily race') === String(roomFixture.todayCount)) pass(`${prefix} renders live room today count`, { expected: roomFixture.todayCount });
  else fail(`${prefix} renders live room today count`, { expected: roomFixture.todayCount, metrics: state.roomRecordMetrics, text: state.roomRecordStripText });

  if (metricValue(state, 'All-time') === String(roomFixture.allTimeCount) || metricValue(state, 'All-time records') === String(roomFixture.allTimeCount) || metricValue(state, 'Room bests') === String(roomFixture.allTimeCount)) pass(`${prefix} renders live room all-time count`, { expected: roomFixture.allTimeCount });
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
    const preloadScript = `${clearAuditPlayerStorageScript()}\n${route.checks.includes('home') && homeQuestionChecks >= officialQuestionCount ? officialWriteStubScript() : ''}`;
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript });
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
      const fullRunQuestionStates = [settledState];
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
        fullRunQuestionStates.push(questionState);
        assertHome(questionState, viewport.id, `home question ${questionNumber}`);
        const nextClick = await clickOptionAndLock(client.send, 'last');
        if (nextClick.clicked) pass(`${viewport.id} home question ${questionNumber} can lock an answer`);
        else {
          fail(`${viewport.id} home question ${questionNumber} can lock an answer`, nextClick);
          break;
        }
      }
      if (homeQuestionChecks >= officialQuestionCount) {
        const scoreClick = await clickPrimaryButton(client.send, 'see score');
        if (scoreClick.clicked) pass(`${viewport.id} home completes the 12-question run and opens the score`, scoreClick);
        else fail(`${viewport.id} home completes the 12-question run and opens the score`, scoreClick);
        await sleep(waitMs);
        const resultState = await evaluate(client.send, route.id, `${viewport.id}-full-result`);
        assertFullOfficialRun(fullRunQuestionStates, resultState, viewport.id);
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

async function auditSpanishLocale(viewport) {
  const base = origin.replace(/\/$/, '');
  const label = 'locale-es';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.2' } });
    await client.send('Emulation.setLocaleOverride', { locale: 'es-ES' }).catch(() => null);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${spanishLocaleScript()}`,
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

    const homeState = await evaluate(client.send, label, viewport.id);
    assertCommon(homeState, label, viewport.id);
    assertHome(homeState, viewport.id, label);

    const commandOpened = await openCommandCenter(client.send);
    if (commandOpened.opened) {
      const commandState = await evaluate(client.send, label, `${viewport.id}-command`);
      assertCommandCenter(commandState, label, viewport.id);
      assertSpanishLocale(commandState, viewport.id, label);
    } else {
      fail(`${viewport.id} ${label} command center opens for translated sidebar proof`, commandOpened);
      assertSpanishLocale(homeState, viewport.id, label);
    }

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

async function auditIqProfileHistory(viewport) {
  const base = origin.replace(/\/$/, '');
  const label = 'profile-history';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${profileHistoryStorageScript()}`,
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
    await client.send('Page.navigate', { url: `${base}/rankings` });
    await waitForReady(client.send);
    await sleep(waitMs);

    const state = await evaluate(client.send, label, viewport.id);
    assertCommon(state, label, viewport.id);
    assertIqProfileHistory(state, viewport.id);

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

async function auditSettingsMatrix(viewport) {
  const base = origin.replace(/\/$/, '');
  const label = 'settings-matrix';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    const seed = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${loggedInSettingsStorageScript()}`,
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
    await client.send('Page.navigate', { url: `${base}/settings` });
    await waitForReady(client.send);
    await sleep(waitMs);
    if (seed?.identifier) {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier }).catch(() => null);
    }

    const initialState = await evaluate(client.send, label, viewport.id);
    assertCommon(initialState, label, viewport.id);
    assertSettingsInitial(initialState, viewport.id);

    const toggled = await toggleAllVisibleSettings(client.send);
    if (toggled.clicked >= 12) pass(`${viewport.id} settings matrix toggles every visible setting`, { clicked: toggled.clicked, after: toggled.after });
    else fail(`${viewport.id} settings matrix toggles every visible setting`, toggled);

    await client.send('Page.reload', { ignoreCache: true });
    await waitForReady(client.send);
    await sleep(waitMs);

    const persistedState = await evaluate(client.send, label, `${viewport.id}-persisted`);
    assertCommon(persistedState, label, viewport.id);
    assertSettingsPersisted(persistedState, viewport.id);

    const commandOpened = await openCommandCenter(client.send);
    if (commandOpened.opened) {
      const commandState = await evaluate(client.send, label, `${viewport.id}-command`);
      if ((commandState.commandNavLabels || []).includes('AI') && (commandState.commandNavLabels || []).includes('Sprint')) pass(`${viewport.id} settings matrix reveals lab modes only after the logged-in setting is enabled`, { labels: commandState.commandNavLabels });
      else fail(`${viewport.id} settings matrix reveals lab modes only after the logged-in setting is enabled`, { labels: commandState.commandNavLabels, command: commandState.commandPanelText.slice(0, 900) });
      await closeCommandCenter(client.send);
    } else {
      fail(`${viewport.id} settings matrix can open command center after settings persist`, commandOpened);
    }

    const settingsScreenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(outDir, `${label}-${viewport.id}.png`), Buffer.from(settingsScreenshot.data, 'base64'));
    pass(`${viewport.id} ${label} settings screenshot captured`, { file: path.join(outDir, `${label}-${viewport.id}.png`) });

    await client.send('Page.navigate', { url: `${base}/` });
    await waitForReady(client.send);
    await sleep(waitMs);

    const homeState = await evaluate(client.send, `${label}-home`, viewport.id);
    assertCommon(homeState, `${label}-home`, viewport.id);
    assertHome(homeState, viewport.id, 'settings matrix home');
    assertSettingsEffects(homeState, viewport.id);

    if (client.events.exceptions.length) fail(`${viewport.id} ${label} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${label} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${label} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${label} has no blocking HTTP errors`);

    const homeScreenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(outDir, `${label}-home-${viewport.id}.png`), Buffer.from(homeScreenshot.data, 'base64'));
    pass(`${viewport.id} ${label} home screenshot captured`, { file: path.join(outDir, `${label}-home-${viewport.id}.png`) });
  } finally {
    client.close();
    await closeTarget(target);
  }
}

async function auditLoggedInLogout(viewport) {
  const base = origin.replace(/\/$/, '');
  const label = 'logged-in-logout';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    const seed = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${loggedInLogoutStorageScript()}`,
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

    const cookieSet = await setAuditPlayerCookie(client.send, base);
    if (cookieSet) pass(`${viewport.id} ${label} seeds a httpOnly player cookie`);
    else fail(`${viewport.id} ${label} seeds a httpOnly player cookie`);

    await client.send('Page.navigate', { url: `${base}/profile` });
    await waitForReady(client.send);
    await sleep(waitMs);
    if (seed?.identifier) {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier }).catch(() => null);
    }

    const profileState = await evaluate(client.send, label, viewport.id);
    assertCommon(profileState, label, viewport.id);
    if (/IQ WARS profile|Profile controls|Profile link|Save profile|Copy profile|Developing IQ WARS profile/i.test(profileState.bodyText) && !/Connect account to manage your profile/i.test(profileState.bodyText)) {
      pass(`${viewport.id} ${label} opens profile as a logged-in player`, { href: profileState.href });
    } else {
      fail(`${viewport.id} ${label} opens profile as a logged-in player`, { href: profileState.href, text: profileState.bodyText.slice(0, 900) });
    }

    const preCookiePresent = await playerCookiePresent(client.send, base);
    if (preCookiePresent) pass(`${viewport.id} ${label} confirms auth cookie exists before logout`);
    else fail(`${viewport.id} ${label} confirms auth cookie exists before logout`);

    const commandOpened = await openCommandCenter(client.send);
    if (commandOpened.opened) {
      const commandState = await evaluate(client.send, label, `${viewport.id}-command-before`);
      const labels = commandState.commandNavLabels || [];
      if (/Logged in|Logout Flow|logout-flow@iqwars\.app/i.test(commandState.commandPanelText) && labels.includes('Profile') && labels.includes('Settings') && /Logout/i.test(commandState.commandPanelText)) {
        pass(`${viewport.id} ${label} command center exposes logged-in identity, profile, settings, and logout`, { labels, text: commandState.commandPanelText.slice(0, 700) });
      } else {
        fail(`${viewport.id} ${label} command center exposes logged-in identity, profile, settings, and logout`, { labels, text: commandState.commandPanelText.slice(0, 900) });
      }
    } else {
      fail(`${viewport.id} ${label} command center opens before logout`, commandOpened);
    }

    const logout = await clickLogout(client.send);
    if (logout.clicked) pass(`${viewport.id} ${label} logout action is clickable`, logout);
    else fail(`${viewport.id} ${label} logout action is clickable`, logout);

    const afterLogout = await loggedInAccountState(client.send);
    if (!afterLogout.localAccount && /logged-out/i.test(afterLogout.commandToggleClass) && /\/$/.test(new URL(afterLogout.href).pathname)) {
      pass(`${viewport.id} ${label} clears local account state and returns to the test`, { href: afterLogout.href, className: afterLogout.commandToggleClass });
    } else {
      fail(`${viewport.id} ${label} clears local account state and returns to the test`, afterLogout);
    }

    const postCookiePresent = await playerCookiePresent(client.send, base);
    if (!postCookiePresent) pass(`${viewport.id} ${label} expires httpOnly player cookie`);
    else fail(`${viewport.id} ${label} expires httpOnly player cookie`);

    const reopened = await openCommandCenter(client.send);
    if (reopened.opened) {
      const postCommandState = await evaluate(client.send, label, `${viewport.id}-command-after`);
      const labels = postCommandState.commandNavLabels || [];
      if (/Logged out|Guest|Connect account/i.test(postCommandState.commandPanelText) && !labels.includes('Profile') && !labels.includes('Settings') && !/\bLogout\b/i.test(postCommandState.commandPanelText)) {
        pass(`${viewport.id} ${label} command center immediately switches to logged-out actions`, { labels, text: postCommandState.commandPanelText.slice(0, 700) });
      } else {
        fail(`${viewport.id} ${label} command center immediately switches to logged-out actions`, { labels, text: postCommandState.commandPanelText.slice(0, 900) });
      }
    } else {
      fail(`${viewport.id} ${label} command center reopens after logout`, reopened);
    }

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(outDir, `${label}-${viewport.id}.png`), Buffer.from(screenshot.data, 'base64'));
    pass(`${viewport.id} ${label} logged-out sidebar screenshot captured`, { file: path.join(outDir, `${label}-${viewport.id}.png`) });

    await closeCommandCenter(client.send);
    await client.send('Page.navigate', { url: `${base}/settings` });
    await waitForReady(client.send);
    await sleep(waitMs);
    const settingsGate = await evaluate(client.send, `${label}-settings-gate`, viewport.id);
    if (/Connect account to manage settings/i.test(settingsGate.bodyText) && !/Standard controls for a public daily game/i.test(settingsGate.bodyText)) {
      pass(`${viewport.id} ${label} settings route is gated after logout`, { href: settingsGate.href });
    } else {
      fail(`${viewport.id} ${label} settings route is gated after logout`, { href: settingsGate.href, text: settingsGate.bodyText.slice(0, 900) });
    }

    if (client.events.exceptions.length) fail(`${viewport.id} ${label} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${label} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${label} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${label} has no blocking HTTP errors`);
  } finally {
    client.close();
    await closeTarget(target);
  }
}

async function auditAgentVisibilityDefaults(viewport) {
  const base = origin.replace(/\/$/, '');
  const cases = [
    {
      id: 'agent-default-hidden',
      source: clearAuditPlayerStorageScript(),
      expectAgents: false,
    },
    {
      id: 'agent-opt-in-visible',
      source: `${clearAuditPlayerStorageScript()}\n${loggedInAgentVisibilityStorageScript({ showAgentActivity: true })}`,
      expectAgents: true,
    },
  ];

  for (const item of cases) {
    const target = await openTarget('about:blank');
    const client = createClient(target.webSocketDebuggerUrl);
    await client.ready;
    try {
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source: item.source });
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        mobile: viewport.mobile,
        deviceScaleFactor: viewport.deviceScaleFactor,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile });
      await client.send('Page.navigate', { url: `${base}/rankings` });
      await waitForReady(client.send);
      await sleep(waitMs);

      const state = await evaluate(client.send, item.id, viewport.id);
      assertCommon(state, item.id, viewport.id);
      assertAgentVisibilityState(state, viewport.id, item.id, { expectAgents: item.expectAgents });

      if (client.events.exceptions.length) fail(`${viewport.id} ${item.id} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
      else pass(`${viewport.id} ${item.id} has no runtime exceptions`);
      const blockingResponses = client.events.responseErrors.filter((entry) => {
        const status = entry.response?.status || 0;
        const url = entry.response?.url || '';
        return status >= 500 || (status >= 400 && url.includes('/api/'));
      });
      if (blockingResponses.length) fail(`${viewport.id} ${item.id} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
      else pass(`${viewport.id} ${item.id} has no blocking HTTP errors`);

      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(path.join(outDir, `${item.id}-${viewport.id}.png`), Buffer.from(screenshot.data, 'base64'));
      pass(`${viewport.id} ${item.id} screenshot captured`, { file: path.join(outDir, `${item.id}-${viewport.id}.png`) });
    } finally {
      client.close();
      await closeTarget(target);
    }
  }
}

async function auditSoundDesign() {
  const base = origin.replace(/\/$/, '');
  const viewport = viewports.find((item) => item.id === 'desktop') || viewports[0];
  const label = 'sound-design';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${soundAuditScript({ soundEnabled: true })}\n${inviteClipboardScript({ mode: 'success' })}`,
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
    assertCommon(await evaluate(client.send, label, viewport.id), label, viewport.id);

    await clearAudioEvents(client.send);
    const selected = await clickOptionOnly(client.send, 0);
    if (selected.clicked) pass('sound design answer option can be selected for audio proof', selected);
    else fail('sound design answer option can be selected for audio proof', selected);
    assertAudioCue(await audioState(client.send), 'sound design option selection', [520, 780]);

    await clearAudioEvents(client.send);
    const wrongLock = await clickLockAnswer(client.send);
    if (wrongLock.clicked) pass('sound design wrong answer lock is clickable', wrongLock);
    else fail('sound design wrong answer lock is clickable', wrongLock);
    const wrongState = await audioState(client.send);
    assertAudioCue(wrongState, 'sound design wrong answer', [196, 147]);
    if (/Not quite|Correct answer/i.test(wrongState.bodyText)) pass('sound design wrong cue is tied to wrong-answer feedback');
    else fail('sound design wrong cue is tied to wrong-answer feedback', { bodyText: wrongState.bodyText });

    await client.send('Page.navigate', { url: `${base}/` });
    await waitForReady(client.send);
    await sleep(waitMs);
    await clearAudioEvents(client.send);
    const correctSelected = await clickOptionOnly(client.send, 1);
    if (correctSelected.clicked) pass('sound design correct answer option can be selected', correctSelected);
    else fail('sound design correct answer option can be selected', correctSelected);
    await clearAudioEvents(client.send);
    const correctLock = await clickLockAnswer(client.send);
    if (correctLock.clicked) pass('sound design correct answer lock is clickable', correctLock);
    else fail('sound design correct answer lock is clickable', correctLock);
    const correctState = await audioState(client.send);
    assertAudioCue(correctState, 'sound design correct answer', [740, 1110]);
    if (/Correct|Clean read/i.test(correctState.bodyText)) pass('sound design success cue is tied to correct-answer feedback');
    else fail('sound design success cue is tied to correct-answer feedback', { bodyText: correctState.bodyText });

    await client.send('Page.navigate', { url: `${base}/` });
    await waitForReady(client.send);
    await sleep(waitMs);
    await clearAudioEvents(client.send);
    const inviteClicked = await clickCreateRoomLink(client.send);
    if (inviteClicked.clicked) pass('sound design invite copy action is clickable', inviteClicked);
    else fail('sound design invite copy action is clickable', inviteClicked);
    assertAudioCue(await audioState(client.send), 'sound design copy action', [660, 990]);

    await client.send('Page.navigate', { url: `${base}/profile` });
    await waitForReady(client.send);
    await sleep(waitMs);
    await clearAudioEvents(client.send);
    const committed = await pointerClickButton(client.send, 'Connect account');
    if (committed.clicked) pass('sound design primary account action is clickable', committed);
    else fail('sound design primary account action is clickable', committed);
    assertAudioCue(await audioState(client.send), 'sound design primary account action', [220, 440, 880]);

    if (client.events.exceptions.length) fail('sound design enabled pass has no runtime exceptions', client.events.exceptions.slice(0, 3));
    else pass('sound design enabled pass has no runtime exceptions');
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail('sound design enabled pass has no blocking HTTP errors', blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass('sound design enabled pass has no blocking HTTP errors');
  } finally {
    client.close();
    await closeTarget(target);
  }

  const disabledTarget = await openTarget('about:blank');
  const disabledClient = createClient(disabledTarget.webSocketDebuggerUrl);
  await disabledClient.ready;
  try {
    await disabledClient.send('Page.enable');
    await disabledClient.send('Runtime.enable');
    await disabledClient.send('Network.enable');
    await disabledClient.send('Network.setCacheDisabled', { cacheDisabled: true });
    await disabledClient.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${soundAuditScript({ soundEnabled: false })}`,
    });
    await disabledClient.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      deviceScaleFactor: viewport.deviceScaleFactor,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await disabledClient.send('Page.navigate', { url: `${base}/` });
    await waitForReady(disabledClient.send);
    await sleep(waitMs);
    await clearAudioEvents(disabledClient.send);
    await clickOptionOnly(disabledClient.send, 0);
    await clickLockAnswer(disabledClient.send);
    assertNoAudioCue(await audioState(disabledClient.send), 'sound design answer flow');

    if (disabledClient.events.exceptions.length) fail('sound design disabled pass has no runtime exceptions', disabledClient.events.exceptions.slice(0, 3));
    else pass('sound design disabled pass has no runtime exceptions');
  } finally {
    disabledClient.close();
    await closeTarget(disabledTarget);
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

async function groupSidebarState(send) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
        };
        const list = document.querySelector('.command-group-list');
        const rows = [...document.querySelectorAll('.command-group-item')].map((item) => {
          const buttons = [...item.querySelectorAll('.command-group-actions button')].map((button) => ({
            text: clean(button.textContent),
            rect: rect(button),
          }));
          return {
            text: clean(item.textContent).slice(0, 700),
            active: item.classList.contains('active'),
            rect: rect(item),
            codeText: clean(item.querySelector('code')?.textContent),
            buttonTexts: buttons.map((button) => button.text),
            buttonRects: buttons.map((button) => button.rect),
          };
        });
        return JSON.stringify({
          href: location.href,
          activeCode: clean(window.localStorage.getItem('world-iq-group-code')),
          activeName: clean(window.localStorage.getItem('world-iq-group-name')),
          copiedText: clean(window.localStorage.getItem('iqwars-audit-copied-text') || window.__iqwarsCopiedText),
          panelVisible: Boolean(document.querySelector('.command-panel')),
          panelText: clean(document.querySelector('.command-panel')?.textContent).slice(0, 2200),
          roomCardText: clean(document.querySelector('.command-room-card')?.textContent).slice(0, 900),
          listRect: rect(list),
          listScrollHeight: list ? Math.round(list.scrollHeight) : 0,
          listClientHeight: list ? Math.round(list.clientHeight) : 0,
          listScrollTop: list ? Math.round(list.scrollTop) : 0,
          rows,
        });
      })()
    `,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

async function clickListedGroupCopy(send, code) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wanted = ${JSON.stringify(code)};
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const row = [...document.querySelectorAll('.command-group-item')].find((item) => clean(item.querySelector('code')?.textContent).includes('/g/' + wanted));
        if (!row) return JSON.stringify({ clicked: false, reason: 'missing row', wanted });
        const button = [...row.querySelectorAll('.command-group-actions button')].find((candidate) => /copy link|copied/i.test(clean(candidate.textContent)));
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing copy button', row: clean(row.textContent).slice(0, 400) });
        const beforeText = clean(button.textContent);
        button.click();
        return JSON.stringify({ clicked: true, beforeText, wanted });
      })()
    `,
    returnByValue: true,
  });
  await sleep(500);
  return JSON.parse(result.result.value);
}

async function clickListedGroupOpen(send, code) {
  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wanted = ${JSON.stringify(code)};
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const row = [...document.querySelectorAll('.command-group-item')].find((item) => clean(item.querySelector('code')?.textContent).includes('/g/' + wanted));
        if (!row) return JSON.stringify({ clicked: false, reason: 'missing row', wanted });
        const button = [...row.querySelectorAll('.command-group-actions button')].find((candidate) => /open board|view board/i.test(clean(candidate.textContent)));
        if (!button) return JSON.stringify({ clicked: false, reason: 'missing open button', row: clean(row.textContent).slice(0, 400) });
        const beforeText = clean(button.textContent);
        button.click();
        return JSON.stringify({ clicked: true, beforeText, wanted });
      })()
    `,
    returnByValue: true,
  });
  await sleep(900);
  return JSON.parse(result.result.value);
}

function assertGroupSidebarState(state, viewportId) {
  const prefix = `${viewportId} group sidebar`;
  const rowCount = Array.isArray(state.rows) ? state.rows.length : 0;
  const activeRows = (state.rows || []).filter((row) => row.active);
  const touchTargetRects = (state.rows || []).slice(0, 3).flatMap((row) => row.buttonRects || []).filter(Boolean);
  const smallestTouchTarget = touchTargetRects.reduce((min, r) => Math.min(min, r.width, r.height), Infinity);
  const expectedActiveUrl = `${origin.replace(/\/$/, '')}/g/room-audit-07`;

  if (rowCount === 24) pass(`${prefix} caps and renders the saved room list`, { rowCount });
  else fail(`${prefix} caps and renders the saved room list`, { rowCount, panelText: state.panelText });

  if (/Friend groups\s*.\s*24\s*listed/i.test(state.panelText)) pass(`${prefix} shows saved group count`);
  else fail(`${prefix} shows saved group count`, { panelText: state.panelText.slice(0, 700) });

  if (activeRows.length === 1 && activeRows[0].codeText.includes('/g/room-audit-07') && /Active private group|Audit Circle 07|Real players only|No seeded agents/i.test(`${state.roomCardText} ${activeRows[0].text}`)) {
    pass(`${prefix} marks one active private room with real-player metadata`, { active: activeRows[0].codeText });
  } else {
    fail(`${prefix} marks one active private room with real-player metadata`, { activeRows, roomCardText: state.roomCardText });
  }

  if ((state.rows || []).every((row) => /Room #\\d{4} . Key [A-Z0-9-]+|Invite-only|Real players only|No agents/i.test(row.text) && row.codeText.includes('/g/room-audit-'))) {
    pass(`${prefix} gives every visible room identity, metadata, and invite URL`);
  } else {
    fail(`${prefix} gives every visible room identity, metadata, and invite URL`, { rows: (state.rows || []).slice(0, 5) });
  }

  if ((state.rows || []).every((row) => row.buttonTexts.some((text) => /Open board|View board/i.test(text)) && row.buttonTexts.some((text) => /Copy link|Copied/i.test(text)))) {
    pass(`${prefix} exposes open-board and copy-link actions on every room`);
  } else {
    fail(`${prefix} exposes open-board and copy-link actions on every room`, { rows: (state.rows || []).slice(0, 5) });
  }

  if (Number.isFinite(smallestTouchTarget) && smallestTouchTarget >= 40) pass(`${prefix} listed room action targets are touchable`, { smallestTouchTarget });
  else fail(`${prefix} listed room action targets are touchable`, { smallestTouchTarget, rects: touchTargetRects });

  if (viewportId === 'mobile') {
    if (state.listScrollHeight > state.listClientHeight + 120 && state.listClientHeight >= 120) pass(`${prefix} many saved rooms stay in a scrollable list`, { scrollHeight: state.listScrollHeight, clientHeight: state.listClientHeight });
    else fail(`${prefix} many saved rooms stay in a scrollable list`, { scrollHeight: state.listScrollHeight, clientHeight: state.listClientHeight, listRect: state.listRect });
  }

  if (state.roomCardText.includes(expectedActiveUrl.replace(/^https?:\/\//, '')) || state.panelText.includes('/g/room-audit-07')) pass(`${prefix} active card exposes the durable invite URL`, { expectedActiveUrl });
  else fail(`${prefix} active card exposes the durable invite URL`, { expectedActiveUrl, roomCardText: state.roomCardText });
}

async function auditGroupCommandCenter(viewport) {
  const base = origin.replace(/\/$/, '');
  const label = 'group-command';
  const target = await openTarget('about:blank');
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `${clearAuditPlayerStorageScript()}\n${groupSidebarStorageScript()}\n${inviteClipboardScript({ mode: 'success' })}`,
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

    const pageState = await evaluate(client.send, label, viewport.id);
    assertCommon(pageState, label, viewport.id);
    const opened = await openCommandCenter(client.send);
    if (opened.opened) pass(`${viewport.id} ${label} command center opens with seeded groups`, opened);
    else fail(`${viewport.id} ${label} command center opens with seeded groups`, opened);

    const sidebar = await groupSidebarState(client.send);
    assertGroupSidebarState(sidebar, viewport.id);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const fileName = `${label}-${viewport.id}.png`;
    await writeFile(path.join(outDir, fileName), Buffer.from(screenshot.data, 'base64'));
    pass(`${viewport.id} ${label} screenshot captured`, { file: path.join(outDir, fileName) });

    const copied = await clickListedGroupCopy(client.send, 'room-audit-06');
    if (copied.clicked) pass(`${viewport.id} ${label} listed room copy action is clickable`, copied);
    else fail(`${viewport.id} ${label} listed room copy action is clickable`, copied);
    const copiedState = await groupSidebarState(client.send);
    const expectedCopiedUrl = `${base}/g/room-audit-06`;
    const copiedRow = (copiedState.rows || []).find((row) => row.codeText.includes('/g/room-audit-06'));
    if (copiedState.copiedText === expectedCopiedUrl && copiedRow?.buttonTexts?.some((text) => /Copied/i.test(text))) {
      pass(`${viewport.id} ${label} listed room copy action writes URL and shows feedback`, { copiedText: copiedState.copiedText });
    } else {
      fail(`${viewport.id} ${label} listed room copy action writes URL and shows feedback`, { expectedCopiedUrl, copiedText: copiedState.copiedText, copiedRow });
    }

    const openedGroup = await clickListedGroupOpen(client.send, 'room-audit-06');
    if (openedGroup.clicked) pass(`${viewport.id} ${label} listed room open action is clickable`, openedGroup);
    else fail(`${viewport.id} ${label} listed room open action is clickable`, openedGroup);
    const openedState = await groupSidebarState(client.send);
    if (/\/rankings\?g=room-audit-06$/.test(new URL(openedState.href).pathname + new URL(openedState.href).search) && openedState.activeCode === 'room-audit-06' && !openedState.panelVisible) {
      pass(`${viewport.id} ${label} listed room opens durable rankings URL and closes sidebar`, { href: openedState.href, activeCode: openedState.activeCode });
    } else {
      fail(`${viewport.id} ${label} listed room opens durable rankings URL and closes sidebar`, { href: openedState.href, activeCode: openedState.activeCode, panelVisible: openedState.panelVisible });
    }

    if (client.events.exceptions.length) fail(`${viewport.id} ${label} has no runtime exceptions`, client.events.exceptions.slice(0, 3));
    else pass(`${viewport.id} ${label} has no runtime exceptions`);
    const blockingResponses = client.events.responseErrors.filter((entry) => {
      const status = entry.response?.status || 0;
      const url = entry.response?.url || '';
      return status >= 500 || (status >= 400 && url.includes('/api/'));
    });
    if (blockingResponses.length) fail(`${viewport.id} ${label} has no blocking HTTP errors`, blockingResponses.slice(0, 5).map((entry) => ({ status: entry.response?.status, url: entry.response?.url })));
    else pass(`${viewport.id} ${label} has no blocking HTTP errors`);
  } finally {
    client.close();
    await closeTarget(target);
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
await auditSoundDesign();
await auditLateRoomJoinSync();
roomFixture = await loadRoomFixture();

for (const viewport of viewports) {
  await auditSpanishLocale(viewport);
  await auditLockedDailyState(viewport, { loggedIn: false });
  await auditLockedDailyState(viewport, { loggedIn: true });
  await auditCreateCopyRoomLink(viewport, { mode: 'success' });
  await auditCreateCopyRoomLink(viewport, { mode: 'denied' });
  await auditGroupCommandCenter(viewport);
  await auditIqProfileHistory(viewport);
  await auditSettingsMatrix(viewport);
  await auditLoggedInLogout(viewport);
  await auditAgentVisibilityDefaults(viewport);
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
