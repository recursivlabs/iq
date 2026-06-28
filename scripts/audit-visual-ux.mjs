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
      const resultCorrect = document.querySelector('.option.result-correct');
      const resultWrong = document.querySelector('.option.result-wrong');
      const proofPill = document.querySelector('.proof-pill');
      const proofPopover = document.querySelector('.proof-popover');
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
        resultCorrect: rect(resultCorrect),
        resultWrong: rect(resultWrong),
        proofPill: rect(proofPill),
        proofPopover: rect(proofPopover),
        proofPopoverText: text(proofPopover),
        proofPopoverVisible: visible(proofPopover),
        visibleRoomRecords: /Room records/i.test(text(document.body)),
        visibleRoomHighscore: /Ongoing room highscore|Room highscore|all-time room highscore/i.test(text(document.body)),
        visibleFriendRankings: /friend rankings/i.test(text(document.body)),
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

function assertRoom(state, viewportId) {
  const prefix = `${viewportId} room`;
  if (state.visibleFriendRankings) pass(`${prefix} opens friend rankings context`);
  else fail(`${prefix} opens friend rankings context`, { bodyText: state.bodyText.slice(0, 500) });
  if (state.visibleRoomRecords) pass(`${prefix} shows persistent room records`);
  else fail(`${prefix} shows persistent room records`, { bodyText: state.bodyText.slice(0, 500) });
  if (state.visibleRoomHighscore) pass(`${prefix} shows ongoing all-time room highscore summary`);
  else fail(`${prefix} shows ongoing all-time room highscore summary`, { bodyText: state.bodyText.slice(0, 700) });
}

function assertRankings(state, viewportId) {
  const prefix = `${viewportId} rankings`;
  if (state.visibleGlobe) pass(`${prefix} exposes geography/globe signal`);
  else fail(`${prefix} exposes geography/globe signal`, { bodyText: state.bodyText.slice(0, 700) });
  if (state.visibleRoomRecords) pass(`${prefix} preserves room records alongside rankings`);
  else fail(`${prefix} preserves room records alongside rankings`, { bodyText: state.bodyText.slice(0, 700) });
  if (state.visibleRoomHighscore) pass(`${prefix} preserves ongoing room highscore summary`);
  else fail(`${prefix} preserves ongoing room highscore summary`, { bodyText: state.bodyText.slice(0, 700) });
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

await mkdir(outDir, { recursive: true });
await ensureChrome();

for (const viewport of viewports) {
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
