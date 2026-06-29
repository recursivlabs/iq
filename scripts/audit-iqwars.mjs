#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src/app/IqApp.tsx');
const layoutPath = path.join(root, 'src/app/layout.tsx');
const i18nPath = path.join(root, 'src/app/i18n.ts');
const leaderboardPath = path.join(root, 'src/app/api/leaderboards/route.ts');
const attemptsPath = path.join(root, 'src/app/api/attempts/route.ts');
const geoPath = path.join(root, 'src/app/api/geo/route.ts');
const agentsManifestPath = path.join(root, 'src/app/api/agents/manifest/route.ts');
const storePath = path.join(root, 'src/app/api/_lib/store.ts');
const rateLimitPath = path.join(root, 'src/app/api/_lib/rateLimit.ts');
const buildInfoPath = path.join(root, 'src/app/api/_lib/buildInfo.ts');
const healthPath = path.join(root, 'src/app/api/health/route.ts');
const readyPath = path.join(root, 'src/app/api/ready/route.ts');
const versionPath = path.join(root, 'src/app/api/version/route.ts');
const recursivConfigPath = path.join(root, 'src/app/api/_lib/recursivConfig.ts');
const playerAuthPath = path.join(root, 'src/app/api/_lib/playerAuth.ts');
const usernamePath = path.join(root, 'src/app/api/username/route.ts');
const profilesPath = path.join(root, 'src/app/api/profiles/route.ts');
const roomMessagesPath = path.join(root, 'src/app/api/rooms/messages/route.ts');
const presencePath = path.join(root, 'src/app/api/presence/route.ts');
const remindersPath = path.join(root, 'src/app/api/reminders/route.ts');
const remindersSendPath = path.join(root, 'src/app/api/reminders/send/route.ts');
const remindersLibPath = path.join(root, 'src/app/api/_lib/reminders.ts');
const accessPath = path.join(root, 'src/app/api/access/route.ts');
const billingConfigPath = path.join(root, 'src/app/api/billing/config/route.ts');
const billingConfigLibPath = path.join(root, 'src/app/api/_lib/billingConfig.ts');
const checkoutPath = path.join(root, 'src/app/api/checkout/route.ts');
const checkoutStatusPath = path.join(root, 'src/app/api/checkout-status/route.ts');
const authSendPath = path.join(root, 'src/app/api/recursiv-auth/send-code/route.ts');
const authVerifyPath = path.join(root, 'src/app/api/recursiv-auth/verify-code/route.ts');
const xConnectPath = path.join(root, 'src/app/api/x/connect/route.ts');
const xCallbackPath = path.join(root, 'src/app/api/x/callback/route.ts');
const xVerifyPath = path.join(root, 'src/app/api/x/verify-post/route.ts');
const apiDaysPath = path.join(root, 'src/app/api/_lib/days.ts');
const apiScoringPath = path.join(root, 'src/app/api/_lib/scoring.ts');
const initialSocialBoardsPath = path.join(root, 'src/app/_lib/initialSocialBoards.ts');
const groupPagePath = path.join(root, 'src/app/g/[group]/page.tsx');
const rankingsPagePath = path.join(root, 'src/app/rankings/page.tsx');
const visualAuditPath = path.join(root, 'scripts/audit-visual-ux.mjs');
const foucTracePath = path.join(root, 'scripts/audit-fouc-trace.mjs');
const authenticatedLaunchAuditPath = path.join(root, 'scripts/run-authenticated-launch-audit.mjs');
const backupScriptPath = path.join(root, 'scripts/export-iqwars-store.mjs');
const prodSmokePath = path.join(root, 'scripts/smoke-iqwars-prod.mjs');
const deployProofPath = path.join(root, 'scripts/prove-iqwars-deploy.mjs');
const storageRunbookPath = path.join(root, 'docs/iqwars-storage-runbook.md');
const packageJsonPath = path.join(root, 'package.json');
const pageRoutePaths = [
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/agents/page.tsx',
  'src/app/blog/page.tsx',
  'src/app/blog/[slug]/page.tsx',
  'src/app/g/[group]/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/profile/page.tsx',
  'src/app/rankings/page.tsx',
  'src/app/research/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/u/[profile]/page.tsx',
].map((routePath) => path.join(root, routePath));

const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    failures.push(message);
  }
}

function source(file) {
  return readFileSync(file, 'utf8');
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function findArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return process.argv[index + 1] || '';
}

const explicitOrigin = findArg('--origin') || process.env.IQWARS_AUDIT_ORIGIN || '';
const runLive = Boolean(explicitOrigin);
const origin = explicitOrigin.replace(/\/$/, '');
const requirePersistent = process.argv.includes('--require-persistent') || process.env.REQUIRE_REDIS === '1' || process.env.REQUIRE_PERSISTENT_STORE === '1';
const expectedCommit = findArg('--expected-commit') || process.env.IQWARS_EXPECTED_COMMIT || '';

async function parseTs(file, kind) {
  const ts = await import('typescript');
  return {
    ts,
    tree: ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, kind),
  };
}

function walk(ts, node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => walk(ts, child, visitor));
}

function findVariable(ts, tree, name) {
  let found = null;
  walk(ts, tree, (node) => {
    if (found) return;
    if (!ts.isVariableDeclaration(node)) return;
    if (ts.isIdentifier(node.name) && node.name.text === name) found = node;
  });
  return found;
}

function findFunction(ts, tree, name) {
  let found = null;
  walk(ts, tree, (node) => {
    if (found) return;
    if (!ts.isFunctionDeclaration(node)) return;
    if (node.name?.text === name) found = node;
  });
  return found;
}

function initializerText(node, text) {
  return node?.initializer ? node.initializer.getText({ text }) : '';
}

function functionText(node, text) {
  return node ? node.getText({ text }) : '';
}

function stringArrayFromVariable(ts, tree, name) {
  const variable = findVariable(ts, tree, name);
  if (!variable?.initializer || !ts.isArrayLiteralExpression(variable.initializer)) return [];
  return variable.initializer.elements
    .map((element) => ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element) ? element.text : null)
    .filter(Boolean);
}

function hashNumber(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function officialWorldIdsFromSource(app, questionCount, noRepeatDays) {
  const explicitNumbers = [...app.matchAll(/id: 'world-(\d+)'/g)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isInteger(number))
    .sort((a, b) => a - b);
  const uniqueNumbers = [...new Set(explicitNumbers)];
  const required = questionCount * noRepeatDays;
  const generatedCount = Math.max(0, required - uniqueNumbers.length);
  const generatedNumbers = Array.from({ length: generatedCount }, (_, index) => uniqueNumbers.length + index + 1);
  return [...uniqueNumbers, ...generatedNumbers].map((number) => `world-${String(number).padStart(2, '0')}`);
}

function hashedSort(seed, ids) {
  return [...ids].sort((a, b) => hashNumber(`${seed}:${a}`) - hashNumber(`${seed}:${b}`) || a.localeCompare(b));
}

function difficultyRankFromLabel(label) {
  const difficulty = String(label || '').toLowerCase();
  if (difficulty.includes('calibration')) return 0;
  if (difficulty.includes('basic') || difficulty.includes('foundation')) return 1;
  if (difficulty.includes('core') || difficulty.includes('adaptive')) return 2;
  if (difficulty.includes('advanced')) return 3;
  if (difficulty.includes('hard') || difficulty.includes('frontier')) return 4;
  if (difficulty.includes('elite')) return 5;
  return 3;
}

function generatedDifficultyLabelFromNumber(number) {
  const index = number - 25;
  const family = index % 4;
  const offset = Math.floor(index / 4) + 1;
  if (family === 2) return offset <= 4 ? 'Foundation' : offset <= 7 ? 'Core' : 'Adaptive';
  if (family === 3) return offset <= 3 ? 'Core' : offset <= 6 ? 'Adaptive' : 'Advanced';
  if (family === 0) return offset <= 3 ? 'Adaptive' : offset <= 6 ? 'Advanced' : 'Frontier';
  return offset <= 2 ? 'Advanced' : offset <= 6 ? 'Frontier' : 'Elite';
}

function officialDifficultyRanksFromSource(app, ids) {
  const labels = new Map();
  for (const match of app.matchAll(/id: 'world-(\d+)'[\s\S]*?difficulty: '([^']+)'/g)) {
    labels.set(`world-${match[1].padStart(2, '0')}`, match[2]);
  }

  return Object.fromEntries(ids.map((id) => {
    const number = Number(id.replace('world-', ''));
    const label = labels.get(id) || (number >= 25 ? generatedDifficultyLabelFromNumber(number) : 'Advanced');
    return [id, difficultyRankFromLabel(id === 'world-01' ? 'Calibration' : label)];
  }));
}

const OFFICIAL_RAMP_PLAN_AUDIT = [
  { minRank: 0, maxRank: 1, take: 3 },
  { minRank: 2, maxRank: 2, take: 6 },
  { minRank: 3, maxRank: 3, take: 9 },
  { minRank: 4, maxRank: 4, take: 11 },
  { minRank: 5, maxRank: 5, take: 12 },
];

function appendRampedIds({ selected, selectedIds, candidates, targetCount, seed, difficultyRanks }) {
  for (const band of OFFICIAL_RAMP_PLAN_AUDIT) {
    if (selected.length >= targetCount) break;
    const bandTarget = Math.min(band.take, targetCount);
    const bandCandidates = hashedSort(`${seed}:ramp:${band.maxRank}`, candidates.filter((id) => !selectedIds.has(id) && difficultyRanks[id] >= band.minRank && difficultyRanks[id] <= band.maxRank));
    for (const id of bandCandidates) {
      if (selected.length >= bandTarget) break;
      selected.push(id);
      selectedIds.add(id);
    }
  }
}

function orderByDifficultyRamp(ids, starterId, orderSeed, difficultyRanks) {
  const rest = hashedSort(orderSeed, ids.filter((id) => id !== starterId))
    .sort((a, b) => difficultyRanks[a] - difficultyRanks[b] || hashNumber(`${orderSeed}:band:${a}`) - hashNumber(`${orderSeed}:band:${b}`));
  return starterId ? [starterId, ...rest] : rest;
}

function simulateOfficialQuestionRotation({ ids, starterIds, difficultyRanks, questionCount, days, playerSeed }) {
  let starterHistory = [];
  let setHistory = [];
  const rounds = [];

  function chooseStarterId(day, candidateIds) {
    if (!candidateIds.length) return '';
    const history = starterHistory.filter((id) => candidateIds.includes(id));
    const available = candidateIds.filter((id) => !history.includes(id));
    const pool = available.length > 0 ? available : candidateIds;
    const index = hashNumber(`${day}:world:${playerSeed}:${history.join(',')}`) % pool.length;
    const starter = pool[index];
    starterHistory = [starter, ...history.filter((id) => id !== starter)].slice(0, candidateIds.length);
    return starter;
  }

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const day = `2026-07-${String(dayIndex + 1).padStart(2, '0')}`;
    const seen = new Set(setHistory.filter((id) => ids.includes(id)));
    const starterPool = starterIds.filter((id) => ids.includes(id));
    const unseenStarterPool = starterPool.filter((id) => !seen.has(id));
    const unseenPool = ids.filter((id) => !seen.has(id));
    const fallbackStarterPool = unseenPool.length ? unseenPool : starterPool;
    const starterId = chooseStarterId(day, unseenStarterPool.length ? unseenStarterPool : fallbackStarterPool);
    const selected = [];
    if (starterId) selected.push(starterId);

    const selectedIds = new Set(selected);
    const seed = `${day}:world:${playerSeed}:question-order:question-set`;
    const unseen = hashedSort(seed, unseenPool.filter((id) => !selectedIds.has(id)));
    const recycled = ids
      .filter((id) => !selectedIds.has(id) && !unseen.includes(id))
      .sort((a, b) => setHistory.indexOf(b) - setHistory.indexOf(a) || hashNumber(`${seed}:recycle:${a}`) - hashNumber(`${seed}:recycle:${b}`));

    appendRampedIds({ selected, selectedIds, candidates: unseen, targetCount: questionCount, seed, difficultyRanks });
    appendRampedIds({ selected, selectedIds, candidates: recycled, targetCount: questionCount, seed: `${seed}:recycle`, difficultyRanks });

    for (const id of [...unseen, ...recycled]) {
      if (selected.length >= questionCount) break;
      if (selectedIds.has(id)) continue;
      selected.push(id);
      selectedIds.add(id);
    }

    setHistory = [
      ...selected.filter((id) => ids.includes(id)),
      ...setHistory.filter((id) => ids.includes(id) && !selected.includes(id)),
    ].slice(0, ids.length);
    rounds.push({
      day,
      starterId,
      selected,
      ordered: orderByDifficultyRamp(selected, starterId, `${day}:world:${playerSeed}:question-order`, difficultyRanks),
    });
  }

  return rounds;
}

async function sourceAudit() {
  const app = source(appPath);
  const layout = source(layoutPath);
  const audit = source(fileURLToPath(import.meta.url));
  const i18n = source(i18nPath);
  const leaderboard = source(leaderboardPath);
  const attempts = source(attemptsPath);
  const agentsManifest = source(agentsManifestPath);
  const store = source(storePath);
  const buildInfo = source(buildInfoPath);
  const health = source(healthPath);
  const ready = source(readyPath);
  const version = source(versionPath);
  const recursivConfig = source(recursivConfigPath);
  const playerAuth = source(playerAuthPath);
  const geo = source(geoPath);
  const username = source(usernamePath);
  const profiles = source(profilesPath);
  const roomMessages = source(roomMessagesPath);
  const presence = source(presencePath);
  const reminders = source(remindersPath);
  const remindersSend = source(remindersSendPath);
  const remindersLib = source(remindersLibPath);
  const access = source(accessPath);
  const billingConfig = source(billingConfigPath);
  const billingConfigLib = source(billingConfigLibPath);
  const checkout = source(checkoutPath);
  const checkoutStatus = source(checkoutStatusPath);
  const authSend = source(authSendPath);
  const authVerify = source(authVerifyPath);
  const xConnect = source(xConnectPath);
  const xCallback = source(xCallbackPath);
  const xVerify = source(xVerifyPath);
  const apiDays = source(apiDaysPath);
  const apiScoring = source(apiScoringPath);
  const initialSocialBoards = source(initialSocialBoardsPath);
  const rateLimit = source(rateLimitPath);
  const groupPage = source(groupPagePath);
  const rankingsPage = source(rankingsPagePath);
  const visualAudit = source(visualAuditPath);
  const foucTrace = source(foucTracePath);
  const authenticatedLaunchAudit = source(authenticatedLaunchAuditPath);
  const backupScript = source(backupScriptPath);
  const prodSmoke = source(prodSmokePath);
  const deployProof = source(deployProofPath);
  const storageRunbook = source(storageRunbookPath);
  const packageJson = source(packageJsonPath);
  const { ts, tree } = await parseTs(appPath, (await import('typescript')).ScriptKind.TSX);

  assert(existsSync(appPath), 'IqApp source exists.');
  assert(existsSync(layoutPath), 'Root layout source exists.');
  assert(existsSync(i18nPath), 'I18n source exists.');
  assert(existsSync(leaderboardPath), 'Leaderboard API route exists.');
  assert(existsSync(attemptsPath), 'Server attempt lock API route exists.');
  assert(existsSync(agentsManifestPath), 'Agent readiness manifest API route exists.');
  assert(existsSync(geoPath), 'Geo API route exists.');
  assert(existsSync(storePath), 'Shared JSON/Redis store exists.');
  assert(existsSync(rateLimitPath), 'Shared durable rate-limit helper exists.');
  assert(existsSync(buildInfoPath), 'Shared deployment build-info helper exists.');
  assert(existsSync(healthPath), 'Storage health API route exists.');
  assert(existsSync(readyPath), 'Launch readiness API route exists.');
  assert(existsSync(versionPath), 'Deployment version API route exists.');
  assert(existsSync(recursivConfigPath), 'Shared Recursiv project auth verifier exists.');
  assert(existsSync(playerAuthPath), 'Shared player auth validator exists.');
  assert(existsSync(usernamePath), 'Username API route exists.');
  assert(existsSync(profilesPath), 'Profile API route exists.');
  assert(existsSync(roomMessagesPath), 'Room message API route exists.');
  assert(existsSync(presencePath), 'Presence API route exists.');
  assert(existsSync(remindersPath), 'Reminder API route exists.');
  assert(existsSync(remindersSendPath), 'Reminder cron send API route exists.');
  assert(existsSync(accessPath), 'Access API route exists.');
  assert(existsSync(billingConfigPath) && existsSync(billingConfigLibPath), 'Billing config API and shared resolver exist.');
  assert(existsSync(checkoutPath), 'Checkout API route exists.');
  assert(existsSync(checkoutStatusPath), 'Checkout status API route exists.');
  assert(existsSync(authSendPath) && existsSync(authVerifyPath), 'Recursiv email auth API routes exist.');
  assert(existsSync(xConnectPath) && existsSync(xCallbackPath) && existsSync(xVerifyPath), 'X verification API routes exist.');
  assert(existsSync(apiDaysPath), 'Shared API board-day validator exists.');
  assert(existsSync(apiScoringPath), 'Shared API scoring canonicalizer exists.');
  assert(existsSync(initialSocialBoardsPath), 'Server initial social-board loader exists.');
  assert(existsSync(visualAuditPath), 'Visual UX audit harness exists.');
  assert(existsSync(foucTracePath), 'FOUC trace audit harness exists.');
  assert(existsSync(backupScriptPath), 'Storage backup/export operator script exists.');
  assert(existsSync(prodSmokePath), 'Production readiness smoke script exists.');
  assert(existsSync(deployProofPath), 'Production deploy no-downtime proof script exists.');
  assert(existsSync(storageRunbookPath), 'Storage backup/restore runbook exists.');
  assert(pageRoutePaths.every((routePath) => existsSync(routePath)), 'All public page route files exist.');

  const dailyLimit = initializerText(findVariable(ts, tree, 'DAILY_PLAY_LIMIT'), app);
  assert(dailyLimit === '1', 'Free official play is limited to one completed run per day.');
  const officialQuestionCount = initializerText(findVariable(ts, tree, 'OFFICIAL_QUESTION_COUNT'), app);
  assert(officialQuestionCount === '12', 'Official world run remains a 12-question baseline.');
  const noRepeatDays = initializerText(findVariable(ts, tree, 'MIN_OFFICIAL_NO_REPEAT_DAYS'), app);
  assert(noRepeatDays === '5', 'Official question bank targets at least five full daily runs before repeating questions.');
  const generatedWorldCount = initializerText(findVariable(ts, tree, 'GENERATED_WORLD_PUZZLE_COUNT'), app);
  assert(generatedWorldCount.includes('OFFICIAL_QUESTION_COUNT * MIN_OFFICIAL_NO_REPEAT_DAYS - 24'), 'Generated official puzzle count fills the no-repeat bank beyond the 24 hand-authored puzzles.');
  const officialRampPlan = initializerText(findVariable(ts, tree, 'OFFICIAL_RAMP_PLAN'), app);
  assert(officialRampPlan.includes('maxRank: 1') && officialRampPlan.includes('take: 6') && officialRampPlan.includes('OFFICIAL_QUESTION_COUNT'), 'Official baseline has an explicit approachable-to-hard difficulty ramp plan.');
  assert(app.includes('showAgentActivity: false'), 'Seeded agent activity is opt-in by default.');
  const xConnectorVisible = initializerText(findVariable(ts, tree, 'X_CONNECTOR_VISIBLE'), app);
  assert(xConnectorVisible === 'false', 'Incomplete X verification connector is hidden behind an explicit launch-off flag.');

  const rankedIds = stringArrayFromVariable(ts, tree, 'rankedWorldPuzzleIds');
  const rankedIdsInit = initializerText(findVariable(ts, tree, 'rankedWorldPuzzleIds'), app);
  assert(rankedIds.length >= 60 || rankedIdsInit.includes('worldPuzzles.map((puzzle) => puzzle.id)'), 'Official world mode uses the full proof-checked bank for a five-day no-repeat window.');
  assert(!rankedIds.length || new Set(rankedIds).size === rankedIds.length, 'Explicit official world puzzle id list has no duplicates.');
  assert(app.includes('...generatedWorldPuzzles()'), 'Generated official puzzle items are included in the proof-checked world puzzle bank.');
  assert(app.includes('function generatedDifficulty') && app.includes("offset <= 4 ? 'Foundation'") && app.includes("offset <= 6 ? 'Frontier'"), 'Generated puzzle bank is difficulty-balanced instead of starting only at hard tiers.');

  const proofChecks = functionText(findFunction(ts, tree, 'withProofChecks'), app);
  assert(proofChecks.includes('solutionProof.checksum') && proofChecks.includes('proofTileSignature'), 'Puzzle answer proofs are checksum-verified at module load.');
  assert(proofChecks.includes('ids.has') && proofChecks.includes('matrix.length !== 9') && proofChecks.includes('filter((item) => item === null).length !== 1'), 'Puzzle proof checks reject duplicate ids and malformed matrices.');
  assert(proofChecks.includes('answerIndex') && proofChecks.includes('options.length < 4') && proofChecks.includes('new Set(puzzle.options.map(tileSignature)).size !== puzzle.options.length'), 'Puzzle proof checks reject invalid answer indexes and duplicate answer options.');
  assert(app.includes('function isValidTile') && proofChecks.includes('isValidTile') && proofChecks.includes('solutionProof.lay.trim()') && proofChecks.includes('solutionProof.formal.trim()'), 'Puzzle proof checks require valid tiles and non-empty proof text.');

  const getQuestions = functionText(findFunction(ts, tree, 'getQuestions'), app);
  const officialStarterPuzzles = initializerText(findVariable(ts, tree, 'officialStarterPuzzles'), app);
  assert(officialStarterPuzzles.includes('difficultyRank(puzzle) <= 2') && !officialStarterPuzzles.includes('.slice('), 'Official starter pool is limited to all approachable calibration/core puzzles.');
  assert(getQuestions.includes('stableQuestionOrder(mode, rankedWorldPuzzles') && getQuestions.includes('officialStarterPuzzles') && getQuestions.includes('OFFICIAL_QUESTION_COUNT'), 'Official question order is stable per day, 12 questions long, and starts from the calibrated starter pool.');
  assert(getQuestions.includes('stableQuestionOrder(mode, agiPuzzles'), 'AGI lab questions use the same stable rotation helper.');

  const chooseStarter = functionText(findFunction(ts, tree, 'chooseStarterId'), app);
  assert(chooseStarter.includes('readQuestionStarterHistory') && chooseStarter.includes('writeQuestionStarterHistory') && chooseStarter.includes('available.length > 0 ? available : candidateIds'), 'Question starters cycle through recent-start history before repeating.');

  const chooseSet = functionText(findFunction(ts, tree, 'chooseQuestionSet'), app);
  assert(chooseSet.includes('readQuestionSetHistory') && chooseSet.includes('writeQuestionSetHistory'), 'Official question sets persist per-player recent question history.');
  assert(chooseSet.includes('unseenPool') && chooseSet.includes('fallbackStarterPool') && chooseSet.includes('history.indexOf(b.id) - history.indexOf(a.id)'), 'Question set selection prefers unseen questions and only recycles least-recently-seen items after the bank is exhausted.');
  assert(app.includes('function appendRampedQuestionCandidates') && chooseSet.includes('appendRampedQuestionCandidates(selected, selectedIds, unseen') && chooseSet.includes('appendRampedQuestionCandidates(selected, selectedIds, recycled'), 'Question set selection fills official runs through the daily difficulty ramp before leftovers.');

  const stableOrder = functionText(findFunction(ts, tree, 'stableQuestionOrder'), app);
  assert(stableOrder.includes('readQuestionOrder') && stableOrder.includes('writeQuestionOrder'), 'Daily question order is persisted so refreshes do not reshuffle an active attempt.');
  assert(stableOrder.includes('chooseQuestionSet') && stableOrder.includes('targetCount'), 'Stable question order selects a fixed-size rotating question set before ordering it.');
  const permutedOrder = functionText(findFunction(ts, tree, 'permutedQuestionOrder'), app);
  assert(app.includes('function difficultyRank') && permutedOrder.includes('difficultyRank(a) - difficultyRank(b)') && permutedOrder.includes(':band:'), 'Question order ramps by difficulty after the rotating starter while randomizing within bands.');

  const questionCountNumber = Number(officialQuestionCount);
  const noRepeatDaysNumber = Number(noRepeatDays);
  const officialIds = officialWorldIdsFromSource(app, questionCountNumber, noRepeatDaysNumber);
  const difficultyRanks = officialDifficultyRanksFromSource(app, officialIds);
  const starterIds = officialIds.filter((id) => difficultyRanks[id] <= 2);
  const simulatedRounds = simulateOfficialQuestionRotation({
    ids: officialIds,
    starterIds,
    difficultyRanks,
    questionCount: questionCountNumber,
    days: noRepeatDaysNumber,
    playerSeed: 'audit-player',
  });
  const simulatedSelections = simulatedRounds.flatMap((round) => round.selected);
  const simulatedOrders = simulatedRounds.map((round) => round.ordered || round.selected);
  assert(officialIds.length >= questionCountNumber * noRepeatDaysNumber, 'Official question bank has enough source IDs for the promised no-repeat window.');
  assert(simulatedRounds.every((round) => round.selected.length === questionCountNumber && new Set(round.selected).size === questionCountNumber), 'Simulated daily official runs contain the configured number of unique questions.');
  assert(new Set(simulatedSelections).size === simulatedSelections.length, 'Simulated official question rotation has no repeated questions across the full no-repeat window.');
  assert(new Set(simulatedRounds.map((round) => round.starterId)).size === Math.min(noRepeatDaysNumber, starterIds.length), 'Simulated official starter question rotates across consecutive days.');
  assert(simulatedOrders.every((order) => difficultyRanks[order[0]] <= 2), 'Simulated official runs start with an approachable starter instead of a hard first item.');
  assert(simulatedOrders.every((order) => order.slice(1).every((id, index, rest) => index === 0 || difficultyRanks[rest[index - 1]] <= difficultyRanks[id])), 'Simulated official runs ramp upward by difficulty after the starter.');
  assert(simulatedOrders.every((order) => order.slice(0, 6).every((id) => difficultyRanks[id] <= 2)), 'Simulated official runs keep the first half in calibration/core territory when unseen supply is available.');
  assert(simulatedOrders.every((order) => order.slice(-3).some((id) => difficultyRanks[id] >= 4)), 'Simulated official runs still end with hard or frontier challenge.');
  const simulatedPlayers = Array.from({ length: 12 }, (_, index) => `audit-player-${index + 1}`);
  const simulatedFirstDays = simulatedPlayers.map((playerSeed) => simulateOfficialQuestionRotation({
    ids: officialIds,
    starterIds,
    difficultyRanks,
    questionCount: questionCountNumber,
    days: noRepeatDaysNumber,
    playerSeed,
  }));
  const firstDayStarters = simulatedFirstDays.map((rounds) => rounds[0]?.starterId || '');
  const firstDaySets = simulatedFirstDays.map((rounds) => (rounds[0]?.selected || []).join(','));
  assert(new Set(firstDayStarters).size >= Math.min(6, starterIds.length), 'Simulated fresh players do not all start on the same official question.');
  assert(new Set(firstDaySets).size >= Math.min(8, simulatedPlayers.length), 'Simulated fresh players receive varied first-day official question sets.');
  assert(simulatedFirstDays.every((rounds) => new Set(rounds.flatMap((round) => round.selected)).size === questionCountNumber * noRepeatDaysNumber), 'Simulated official question rotation avoids repeats for every audited fresh player across the full no-repeat window.');

  const buildGlobe = functionText(findFunction(ts, tree, 'buildGlobeRegions'), app);
  assert(buildGlobe.includes('geography.countries') && buildGlobe.includes('geography.cities.slice') && buildGlobe.includes('geography.towns.slice'), 'Globe regions derive only from ranked geography board rows.');
  assert(app.includes('PLACE_GLOBE_CENTERS') && app.includes('globeCoordinateFromKnownPlace') && app.includes("'city:new york:us'") && app.includes("'city:singapore:sg'"), 'Globe uses real known city/town coordinates before hash fallback.');
  assert(!buildGlobe.includes('fallbackGeo') && !buildGlobe.includes('Local signal') && !buildGlobe.includes('score: 100'), 'Globe heat never fabricates a local fallback region or score.');

  const result = app.slice(app.indexOf('function Result('), app.indexOf('function Runner('));
  assert(result.includes('readOfficialRank()') && result.includes("setResultStatus('practice')"), 'Retakes after a locked daily result are marked practice.');
  assert(result.includes('claimServerOfficialAttempt') && result.includes('syncLocalOfficialLock(officialRank)'), 'First official completion claims the server attempt lock before local official sync.');
  assert(result.includes('consumePlay()'), 'First official completion consumes the daily attempt locally.');
  assert(result.includes('onLeaderboard(entry, officialRank)'), 'Official completion submits into the leaderboard flow.');
  assert(result.includes("setRoomPostState('posting')") && result.includes("disabled={roomRankingsPending}") && result.includes("Posting score to this room..."), 'Official room results visibly wait for the room score write before opening room rankings.');
  assert(result.includes("copy(roomRankingsPending ? 'Posting score to this room...' : groupCode ? 'See room rankings' : 'See rankings')"), 'Official result exposes room rankings only after score sync is not actively posting.');

  const runner = app.slice(app.indexOf('function Runner('), app.indexOf('export default function Home'));
  assert(runner.includes('readServerOfficialAttempt') && runner.includes('onServerAttemptLocked'), 'Runner syncs server-side daily attempt locks.');
  assert(runner.includes('locked-score-grid') && runner.includes("copy(groupCode ? 'View room rankings' : 'View rankings')") && runner.includes("copy('Unlock profile')"), 'Locked daily state shows the saved score and routes players to rankings before upgrade.');

  const handleLeaderboard = app.slice(app.indexOf('function handleLeaderboard'), app.indexOf('const handleUsageChange'));
  assert(handleLeaderboard.includes('refreshSocialBoards(groupCode || null)') && !handleLeaderboard.includes("navigateView('rankings')") && !handleLeaderboard.includes('navigateGroupRankings(groupCode)'), 'Completing the official run keeps the score panel visible while refreshing rankings in the background.');
  assert(app.includes('onRankings={() => groupCode ? navigateGroupRankings(groupCode) : navigateView(\'rankings\')}'), 'Room result and locked-state ranking CTAs use durable room rankings URLs instead of generic rankings.');
  const footer = functionText(findFunction(ts, tree, 'SiteFooter'), app);
  assert(!footer.includes("onView('agents')"), 'Public footer keeps secondary agent tools out of the main logged-out loop.');
  assert(app.includes("view === 'agents' && !recursivAccount") && app.includes('Connect account to use agent tools.'), 'Agent-ready surface is gated behind account connection for logged-out visitors.');
  assert(agentsManifest.includes("status: 'evaluation_contract_ready'") && agentsManifest.includes("loggedOutAgentsRouteBehavior: 'account_gate'") && agentsManifest.includes("privateRoomPolicy: 'agents_excluded'"), 'Agent readiness manifest preserves human-first launch policy and keeps private rooms agent-free.');
  assert(agentsManifest.includes('agentDisclosureRequired') && agentsManifest.includes('toolPermissions') && agentsManifest.includes('retryPolicy') && agentsManifest.includes('telemetrySchema'), 'Agent readiness manifest defines identity, capability, integrity, and telemetry disclosure requirements.');
  assert(agentsManifest.includes('humansDefault') && agentsManifest.includes('agents=false') && agentsManifest.includes('disclosedAgentsOptIn') && agentsManifest.includes('cache-control') && agentsManifest.includes('no-store'), 'Agent readiness manifest exposes default human leaderboard and opt-in disclosed-agent leaderboard semantics without caching stale policy.');
  const researchSection = app.slice(app.indexOf('const RESEARCH_SOURCES'), app.indexOf('const BLOG_ARTICLES'));
  const blogSection = app.slice(app.indexOf('const BLOG_ARTICLES'), app.indexOf('function activeBlogSlugFromPath'));
  const researchView = app.slice(app.indexOf('function ResearchView'), app.indexOf('function AgentsView'));
  const blogSlugs = [...blogSection.matchAll(/slug: '([^']+)'/g)].map((match) => match[1]);
  assert(researchSection.includes('https://doi.org/10.1037/0033-295X.97.3.404') && researchSection.includes('https://doi.org/10.1073/pnas.0801268105') && researchSection.includes('https://doi.org/10.1037/a0028228') && researchSection.includes('https://doi.org/10.1177/1529100616661983') && researchSection.includes('https://arxiv.org/abs/2302.04238'), 'Research page cites primary/review sources for matrix reasoning, cognitive training, and AI reasoning benchmarks.');
  assert(researchView.includes('we do not claim a browser game clinically raises innate IQ') && researchView.includes('not clinical IQ certification') && researchView.includes('What remains unproven'), 'Research page keeps IQ-improvement claims conservative and clearly labels what remains unproven.');
  assert(app.includes('reasoning-game ranking for players, groups, and geographies') && app.includes('among active players') && app.includes('strongest active-player daily reasoning scores') && app.includes('becomes less noisy as more daily signals accumulate') && app.includes('not clinical IQ diagnoses, educational/admission decisions, employment signals, or proof of innate intelligence') && app.includes('not a clinical IQ test, admission test, employment screen, high-IQ society qualifier, or supervised psychometric assessment'), 'About page keeps intelligence-positioning copy conservative and excludes clinical, admissions, employment, society-qualification, or innate-intelligence claims.');
  assert(blogSlugs.length >= 10 && new Set(blogSlugs).size === blogSlugs.length, 'Blog inventory contains at least 10 unique SEO article routes.');
  assert(['best-online-iq-test', 'can-iq-puzzles-make-you-smarter', 'raven-matrices-and-fluid-intelligence', 'iq-leaderboard-countries-cities', 'ai-vs-human-iq-test', 'best-iq-test-for-friend-groups'].every((slug) => blogSlugs.includes(slug)), 'Blog inventory covers viral IQ, research, geography, AI, daily habit, and friend-group topics.');
  assert(blogSection.includes('keywords:') && blogSection.includes('regionIntent:') && blogSection.includes('IQ WARS treats daily scores as competitive reasoning signals, not clinical proof of innate ability.'), 'Blog articles include SEO keywords, geo/search intent, and conservative intelligence-claim caveats.');

  assert(groupPage.includes('initialView="rankings"') && groupPage.includes('initialGroupCode={params.group}'), 'Friend group route opens directly into the room rankings and injects the room code.');
  assert(rankingsPage.includes('initialView="rankings"') && rankingsPage.includes("searchParams?.g"), 'Rankings route opens directly into a friend room board from ?g=.');
  assert(initialSocialBoards.includes('loadInitialSocialBoards') && initialSocialBoards.includes('/api/leaderboards?') && initialSocialBoards.includes("agents: 'false'") && groupPage.includes('initialSocialBoards={initialSocialBoards}') && rankingsPage.includes('initialSocialBoards={initialSocialBoards}'), 'Friend room routes server-prefill today and all-time room boards before hydration.');
  assert(app.includes("if (code || !settings.showAgentActivity) params.set('agents', 'false');"), 'Private room leaderboard reads force agents=false.');
  assert(app.includes("if (submittedGroupCode || !settings.showAgentActivity) params.set('agents', 'false');"), 'Private room leaderboard writes force agents=false in the response.');
  assert(app.includes('groupRecords.map((group) => group.code)') && app.includes('randomRoomCode(knownCodes)'), 'New room creation checks current and saved room codes before generating a unique link.');
  assert(app.includes('async function syncOfficialRankToGroup') && app.includes('submitOfficialResult(officialRank, { groupCode: cleaned, groupName: name })'), 'Opening a friend room can backfill today\'s saved official score into that room.');
  assert(app.includes('readServerOfficialAttempt(playerId || readPlayerId())') && app.includes('syncLocalOfficialLock(serverAttempt)') && app.includes('Local room membership still works if the server attempt lookup is unavailable.'), 'Friend room late-join sync falls back to today\'s server-locked official attempt when local storage is missing.');
  assert(app.includes('scheduleRoomScoreRetry') && app.includes('Retrying room score sync...') && app.includes('Score saved locally. Retrying room board sync...'), 'Friend room score sync surfaces failed room writes and retries them instead of silently dropping a completed score.');
  assert(app.includes('Promise<boolean>') && app.includes('if (!response.ok) return false') && app.includes("setRoomSyncState('Room score posted.')"), 'Leaderboard submissions return a success signal so room score sync can show posted or retrying state.');
  assert(app.includes('writePlayerId(linkedPlayerId)') && app.includes('claimServerOfficialAttempt(linkedPlayerId, officialRank)') && app.includes('body: JSON.stringify({ email, code, playerId: playerId || readPlayerId() })'), 'Email account connection links the Recursiv account to a durable player id and reclaims today\'s official score before room sync.');
  assert(app.includes('roomSyncState={roomSyncState}') && app.includes('className={`room-sync-state') && app.includes('aria-live="polite"'), 'Room score sync state is visible on room/test surfaces for posted and retrying states.');
  assert(app.includes('if (groupCode) void syncOfficialRankToGroup(groupCode, groupName)') && app.includes('IQ WARS account connected. Profile and settings are unlocked.'), 'Email account connection immediately rechecks active room score sync after unlocking account features.');
  assert(app.includes('if (code) syncOfficialRankToGroup(code, name)') && app.includes('syncOfficialRankToGroup(queryGroup, name)'), 'Route and query room joins sync today\'s official score before refreshing the room board.');
  assert(app.includes('syncOfficialRankToGroup(cleaned, displayName)') && app.includes('syncOfficialRankToGroup(code, name)'), 'Sidebar room opens and newly created rooms share the same score sync path.');
  assert(app.includes('window.setInterval(refreshVisibleRoom, 12_000)') && app.includes("window.addEventListener('focus', refreshVisibleRoom)") && app.includes("document.addEventListener('visibilitychange', refreshVisibleRoom)"), 'Open friend rooms refresh live so newly finished friend scores appear without manual reload.');
  assert(leaderboard.includes('function groupAllTimeRows') && leaderboard.includes('groupAllTime: groupCode ? groupAllTimeRows'), 'Friend room API returns an all-time room record board alongside today\'s board.');
  assert(app.includes('groupAllTime: SocialEntry[]') && app.includes('displayBoards.groupAllTime') && app.includes("copy('All-time room highscores')"), 'Friend room rankings render persistent room records in addition to today\'s scores.');
  assert(app.includes('function RoomRecordStrip') && app.includes('Ongoing room highscore') && app.includes('This room keeps old scores for the ongoing highscore race. The daily board still resets every day.'), 'Friend room rankings surface all-time highscores as a primary room summary above the daily board.');
  assert(app.includes("cta={copy(groupCode && !officialSnapshot ? 'Take today\\'s test'") && app.includes('onCta={groupCode && !officialSnapshot ? navigateGroupTest') && app.includes("ctaKind={groupCode && !officialSnapshot ? 'action' : 'copy'}"), "Friend room rankings send unplayed invite visitors into today's test while keeping copy-link actions for locked players.");
  assert(app.includes('function groupRoomNumber') && app.includes('function groupInviteKey') && app.includes('function groupRoomIdentity'), 'Friend groups render stable room numbers plus invite keys in the sidebar list.');
  assert(app.includes('return `Group ${groupInviteKey(code)}`') && app.includes('groupRoomIdentity(group.code)') && app.includes('className="group-room-tag"'), 'Newly created friend groups get distinct visible invite-key identities in the sidebar list.');
  assert(app.includes('function navigateGroupRankings') && app.includes('groupRankingsPath(cleaned)') && app.includes('navigateGroupRankings(cleaned)'), 'Opening a listed friend group lands on its durable rankings URL.');
  assert(app.includes('command-panel sidebar-nav') && app.includes('Left sidebar') && app.includes('command-scroll') && app.includes('role="navigation"'), 'Navigation renders as a left sidebar drawer with scrollable app navigation.');
  assert(app.includes('function closeNavMenu') && app.includes('function handleCommandKeyDown') && app.includes("event.key === 'Escape'") && app.includes("event.key !== 'Tab'"), 'Command sidebar handles Escape close and Tab focus trapping.');
  assert(app.includes("event.key === 'Enter' || event.key === ' '") && app.includes('setNavOpen((open) => !open);'), 'Command sidebar launcher supports explicit keyboard activation.');
  assert(app.includes('commandToggleRef') && app.includes('commandPanelRef') && app.includes('closeCommandRef') && app.includes('closeCommandRef.current?.focus()'), 'Command sidebar moves focus into the drawer and restores focus to the launcher.');
  assert(app.includes('command-room-card') && app.includes('No active group') && app.includes('command-profile-meta'), 'Sidebar includes a structured command-center room and identity summary.');
  assert(app.includes('formatGroupCreatedAt') && app.includes('groupShareUrl(group.code)') && app.includes('Invite-only') && app.includes('Real players only'), 'Friend groups are listed with distinct invite-only real-player room metadata.');
  assert(app.includes('command-group-item') && app.includes('command-group-actions') && app.includes('copyListedGroupLink(group.code)'), 'Friend group sidebar rows are listed items with separate open-board and copy-link actions.');
  assert(app.includes("copy('No agents')") && app.includes('Open board') && app.includes('Copy link'), 'Friend group rows explicitly avoid agents and expose direct open/copy controls.');
  assert(app.includes('Active private group') && app.includes('Only real people who open this link appear here.') && app.includes('No seeded agents in private groups.') && app.includes('Each new group gets a different invite link and starts empty until real players open it.'), 'Friend-room UI promises link-only real invited players instead of seeded agents.');

  assert(leaderboard.includes("request.nextUrl.searchParams.get('agents') !== 'false'"), 'Leaderboard API supports agents=false filtering.');
  assert(visualAudit.includes('auditAgentVisibilityDefaults') && visualAudit.includes('keeps seeded test agents hidden by default') && visualAudit.includes('shows seeded test agents only after the setting is enabled'), 'Visual audit covers seeded agent visibility defaults and opt-in ranking mode.');
  assert(visualAudit.includes('const day = todayKey();') && visualAudit.includes("new URLSearchParams({ day, group: room, agents: 'false' })"), 'Visual audit room/geography fixtures use the same local day as the browser client.');
  assert(layout.includes("import './critical.css'") && layout.includes('data-iqwars-critical') && layout.includes('theme-color') && layout.includes('background:#060708'), 'Root layout inlines dark first-paint CSS before external resources.');
  assert(packageJson.includes('"audit:fouc": "node scripts/audit-fouc-trace.mjs --origin https://iqwars.app"') && foucTrace.includes('Network.emulateNetworkConditions') && foucTrace.includes('Page.captureScreenshot') && foucTrace.includes('__iqwarsFoucSamples'), 'Package scripts expose a throttled FOUC trace with screenshots and first-paint samples.');
  assert(app.includes('const ADSENSE_READY = /^ca-pub-\\d{8,}$/') && app.includes('if (!ADSENSE_READY || typeof window') && app.includes('{ADSENSE_READY ?'), 'AdSense slot renders and pushes ads only when client and slot are valid.');
  assert(layout.includes('const adsenseSlot = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SLOT') && layout.includes('const adsenseReady = /^ca-pub-\\d{8,}$/') && layout.includes('{adsenseReady ?'), 'Root layout loads the Google ad script only when the full AdSense config is valid.');
  assert(apiDays.includes('BOARD_DAY_SKEW_DAYS = 1') && apiDays.includes('sanitizeBoardDay') && leaderboard.includes('sanitizeBoardDay'), 'Leaderboard API rejects arbitrary stale/future board days while allowing timezone skew.');
  assert(apiScoring.includes('canonicalOfficialScore') && leaderboard.includes('canonicalOfficialScore') && leaderboard.includes('safeCorrect > safeTotal'), 'Leaderboard API derives canonical score/rank server-side and rejects impossible totals.');
  assert(leaderboard.includes('beatAi > correct') && leaderboard.includes('safeBeatAi > safeCorrect'), 'Leaderboard API rejects impossible AI-beat counts.');
  assert(leaderboard.includes("!entry.playerId.startsWith('agent-')"), 'Friend group leaderboard excludes seeded agent players.');
  assert(leaderboard.includes('geo: sanitizeGeo(body.geo)'), 'Leaderboard submissions persist sanitized geography snapshots.');
  assert(leaderboard.includes('geography: geographyRows(responseEntries, day)') && leaderboard.includes('geographyRows(entries, day)'), 'Geography boards are computed from the same real leaderboard entry set.');
  assert(leaderboard.includes('const bestByPlaceAndPlayer = new Map'), 'Geography boards dedupe by place and player before averaging.');

  assert(attempts.includes("STORE_KEY = 'world-iq:official-attempts:v1'"), 'Attempt lock API stores official attempts under a dedicated key.');
  assert(attempts.includes('accepted: false') && attempts.includes('locked: true'), 'Attempt lock API returns an existing lock instead of accepting duplicates.');
  assert(attempts.includes('sanitizeBoardDay') && attempts.includes('Invalid attempt day.'), 'Attempt lock API rejects arbitrary stale/future official attempt days.');
  assert(attempts.includes('canonicalOfficialScore') && attempts.includes('correct > total'), 'Attempt lock API derives canonical score/rank server-side and rejects impossible totals.');
  assert(attempts.includes('beatAi > correct') && attempts.includes('beatAi > total'), 'Attempt lock API rejects impossible AI-beat counts.');
  assert(attempts.includes('readJsonStore') && attempts.includes('updateJsonStore'), 'Attempt lock API uses the shared serialized store.');

  assert(username.includes('isValidUsername') && username.includes('status: 409'), 'Username API validates format and rejects claims owned by another player.');
  assert(profiles.includes('publicProfile(profile)') && profiles.includes('profilePublic'), 'Profile API applies public/privacy controls before returning profiles.');
  assert(profiles.includes('MAX_PROFILE_ATTEMPTS') && profiles.includes('MAX_PROFILE_ANSWERS') && profiles.includes('MAX_PROFILE_SCORE'), 'Profile API clamps public score/history metadata to the supported daily-history range.');
  assert(profiles.includes('xVerified: false') && !profiles.includes('Boolean(value.xVerified)') && profiles.includes('normalizeProfile(profile as Record<string, unknown>)'), 'Profile API does not trust client-submitted X badges or legacy stored profile flags.');
  assert(app.includes('const xProfileVisible = X_CONNECTOR_VISIBLE && settings.showXBadge && xVerification?.status === \'verified\'') && app.includes('showXBadge: xProfileVisible'), 'Local public profiles suppress X handles and badges unless the hidden connector is intentionally enabled and verified.');
  assert(!app.includes('settingKey="showXBadge"') && !app.includes('onClick={connectX}') && !app.includes('onClick={verifyXPost}') && !app.includes('onClick={postXScorecard}'), 'Launch UI does not expose X badge settings or incomplete X verification actions.');
  assert(playerAuth.includes('PLAYER_API_KEY_COOKIE') && playerAuth.includes('/api/v1/users/me') && playerAuth.includes('/api/v1/projects/') && playerAuth.includes('IQWARS_PROJECT_ID') && playerAuth.includes('Connect an IQ WARS project account before continuing.'), 'Shared player auth validator verifies Recursiv player keys, requires IQ WARS project access, and fails closed.');
  assert(profiles.includes('validatePlayerAccount') && profiles.includes('Connect an IQ WARS account before saving a profile.'), 'Profile write API requires a verified IQ WARS player account.');
  assert(roomMessages.includes('MAX_ROOM_MESSAGES') && roomMessages.includes('sanitizeBody'), 'Room messages API limits and sanitizes room chat.');
  assert(roomMessages.includes('validatePlayerAccount') && roomMessages.includes('Connect an IQ WARS account before posting room chat.'), 'Room chat write API requires a verified IQ WARS player account.');
  assert(presence.includes('ACTIVE_WINDOW_MS = 45_000') && presence.includes('RETAIN_WINDOW_MS = 180_000') && presence.includes('MAX_SESSIONS = 10_000'), 'Presence API defines explicit active, retention, and maximum session windows.');
  assert(presence.includes('function pruneSessions') && presence.includes('now - session.lastSeen <= RETAIN_WINDOW_MS') && presence.includes('slice(-MAX_SESSIONS)'), 'Presence API prunes stale retained sessions and caps stored sessions.');
  assert(presence.includes('function activeCount') && presence.includes('now - session.lastSeen <= ACTIVE_WINDOW_MS'), 'Presence API counts only actively heartbeating sessions.');
  assert(presence.includes('current.sessions = pruneSessions(current.sessions, now)') && presence.includes('filter((existing) => existing.id !== sessionId)') && presence.includes('sessions.push(session)'), 'Presence POST prunes stale sessions and replaces duplicate session ids before adding a heartbeat.');
  assert(app.includes('window.setInterval(heartbeat, 20_000)') && app.includes("document.visibilityState === 'visible'") && app.includes("aria-label={copy('Live users')}"), 'Client sends regular presence heartbeats, refreshes on visible tab, and exposes a live-user pill.');
  assert(reminders.includes('validEmail') && reminders.includes('sendConfirmation'), 'Reminder API validates email and stores daily reminders.');
  assert(reminders.includes('shouldSendConfirmation') && reminders.includes('confirmationSentAt'), 'Reminder signup only sends confirmation email until a reminder has a recorded confirmation.');
  assert(remindersLib.includes('MAX_REMINDERS') && remindersLib.includes('normalizeReminder') && remindersLib.includes('validEmail') && remindersLib.includes('new Map'), 'Reminder store normalizes, dedupes, and bounds reminder records before reads and writes.');
  assert(remindersSend.includes('IQ_REMINDER_CRON_TOKEN') && remindersSend.includes("process.env.NODE_ENV === 'production'"), 'Reminder cron send API requires explicit production configuration.');
  assert(remindersSend.includes('buildReminderDigest') && remindersSend.includes('currentStreakDays') && remindersSend.includes('Personal best') && remindersSend.includes('Room record'), 'Reminder cron sends a streak, score, and room-record digest instead of a generic nudge.');
  assert(remindersSend.includes('readLeaderboardEntries') && remindersSend.includes("LEADERBOARD_STORE_KEY = 'world-iq:leaderboards:v2'"), 'Reminder cron reads leaderboard history to personalize daily streak emails.');
  assert(remindersSend.includes('reply STOP') && remindersSend.includes('bill@recursiv.io'), 'Reminder emails include a simple stop-reminders instruction.');
  assert(access.includes('PLAYER_API_KEY_COOKIE') && access.includes('app-subscriptions/status'), 'Access API checks Recursiv app subscription status from the player key.');
  assert(billingConfigLib.includes('resolveBillingConfig') && billingConfigLib.includes('IQWARS_SUBSCRIPTION_TIER') && billingConfigLib.includes('NEXT_PUBLIC_STRIPE_PAYMENT_LINK') && billingConfigLib.includes('paymentLinkUrl'), 'Billing config resolver supports Recursiv app-subscription tiers and hosted payment-link fallback.');
  assert(billingConfig.includes('publicBillingConfig') && billingConfig.includes('cache-control') && !billingConfig.includes('paymentLinkUrl'), 'Billing config API exposes checkout readiness without leaking the hosted checkout URL.');
  assert(app.includes("fetch('/api/billing/config'") && app.includes('normalizeBillingUiConfig') && app.includes('billingConfig.checkoutReady'), 'Unlock modal reads billing readiness at runtime instead of relying only on a build-time public flag.');
  assert(checkout.includes('PLAYER_API_KEY_COOKIE') && checkout.includes('safeReturnUrl') && checkout.includes('resolveBillingConfig'), 'Checkout API requires a player key, sanitizes return URLs, and uses shared billing config.');
  assert(checkout.includes("provider: 'payment_link'") && checkout.includes('fallback: true') && checkout.includes('recursivResponse.status !== 401'), 'Checkout API falls back to a configured hosted payment link when Recursiv tier routing is unavailable without masking auth failures.');
  assert(checkoutStatus.includes('PLAYER_API_KEY_COOKIE') && checkoutStatus.includes('setAccessCookie'), 'Checkout status API requires a player key and syncs the access cookie.');
  assert(authSend.includes('IQWARS_PROJECT_API_KEY') && authSend.includes('Host: IQWARS_APP_HOST'), 'Email-code send route uses the IQ WARS project key and branded host.');
  assert(authVerify.includes('IQWARS_PROJECT_ID') && authVerify.includes('projectId: IQWARS_PROJECT_ID') && authVerify.includes("'projects:read'"), 'Email-code verify route creates project-scoped IQ WARS player keys with project-read validation scope.');
  assert(authVerify.includes('world-iq:account-links:v1') && authVerify.includes('resolveLinkedPlayerId') && authVerify.includes('playerId: linkedPlayerId || requestedPlayerId'), 'Email-code verify route persists a stable account-to-player link for cross-device room score continuity.');
  assert(xConnect.includes('safeReturnPath') && xConnect.includes('code_challenge_method'), 'X connect route sanitizes returns and uses PKCE.');
  assert(xCallback.includes('expectedState !== state') && xCallback.includes('redirectWithParams'), 'X callback route verifies state and redirects with status params.');
  assert(xVerify.includes('X_BEARER_TOKEN') && xVerify.includes('IQ\\s*WARS'), 'X post verification route requires configured bearer access and IQ WARS scorecard text.');

  assert(app.includes('geo: geoSnapshot || fallbackGeoSnapshot()'), 'Client submits inferred/fallback geography with official results.');
  assert(app.includes('buildGlobeRegions(geography') && app.includes('geography.countries'), 'Home/rankings globe derives regions from geography board data.');
  assert(i18n.includes('Official scores use edge geography when available and timezone as a fallback; empty boards stay empty until ranked attempts land.'), 'Updated real-data geography empty state is localized.');

  assert(geo.includes('x-vercel-ip-country') && geo.includes('queryTimeZone') && geo.includes('countryFromLocale'), 'Geo API combines edge headers, timezone, and browser locale fallbacks.');

  assert(store.includes('UPSTASH_REDIS_REST_URL') && store.includes('KV_REST_API_URL') && store.includes('REDIS_URL') && store.includes('DATABASE_URL'), 'Store supports Redis/Upstash/Vercel KV and Postgres configuration.');
  assert(store.includes('incomplete_redis_rest_config') && store.includes('invalid_redis_url') && store.includes('invalid_postgres_url') && store.includes("'misconfigured'"), 'Store health reports partial or invalid persistent envs as misconfigured instead of silently falling back.');
  assert(store.includes("path.join('/tmp'"), 'Store has only an ephemeral /tmp fallback when no persistent store is configured.');
  assert(store.includes('if (!config) return undefined') && store.includes('if (rest !== undefined) return rest'), 'Redis REST command routing preserves nil command results.');
  assert(store.includes('verifyPersistentStore') && store.includes("'SET', key, nonce, 'EX', '120'") && store.includes('postgresWriteJsonStore') && store.includes('postgresReadJsonStore'), 'Persistent store health verifies configured storage with a write/read round trip.');
  assert(store.includes('world-iq:health-check:v1:${nonce}') && store.includes("['DEL', key]") && store.includes('delete from ${table} where key = $1'), 'Persistent store health uses isolated per-request keys and cleans them up for concurrent readiness probes.');
  assert(buildInfo.includes('COMMIT_ENV_KEYS') && buildInfo.includes('readGitInfoFromDir') && buildInfo.includes('cleanCommit') && version.includes('getBuildInfo') && version.includes('cache-control') && version.includes('no-store'), 'Deployment version endpoint exposes sanitized commit metadata from env or git with no-store cache policy.');
  assert(store.includes('updateJsonStore') && store.includes('withLocalLock') && store.includes("'SET', key, token, 'NX', 'PX', '5000'") && store.includes('pg_advisory_xact_lock'), 'Shared store serializes read-modify-write updates locally and with persistent store locks.');
  assert(packageJson.includes('"backup:export": "node scripts/export-iqwars-store.mjs"'), 'Package scripts expose the IQ WARS storage export tool.');
  assert(backupScript.includes('STORE_KEYS') && backupScript.includes('world-iq:leaderboards:v2') && backupScript.includes('world-iq:official-attempts:v1') && backupScript.includes('world-iq:rate-limits:v1'), 'Storage export script covers every app-owned durable JSON key.');
  assert(backupScript.includes("schema: 'iqwars-json-store-backup/v1'") && backupScript.includes('sha256') && backupScript.includes('Contains user data'), 'Storage export script writes a versioned sensitive-data backup with per-key checksums.');
  assert(backupScript.includes('--restore') && backupScript.includes('--yes') && backupScript.includes('Restore is destructive'), 'Storage export script supports guarded restore with an explicit destructive confirmation flag.');
  assert(backupScript.includes('UPSTASH_REDIS_REST_URL') && backupScript.includes('KV_REST_API_URL') && backupScript.includes('REDIS_URL') && backupScript.includes('IQWARS_DATABASE_URL'), 'Storage export script can read Redis REST, Redis URL, KV REST, or Postgres stores.');
  assert(storageRunbook.includes('pnpm backup:export') && storageRunbook.includes('/api/ready') && storageRunbook.includes('/api/health') && storageRunbook.includes('Restore is destructive'), 'Storage runbook documents export, readiness checks, and guarded restore.');
  assert(storageRunbook.includes('emails, profile text, room messages') && storageRunbook.includes('Keep daily encrypted exports for 30 days') && /restore rehearsal/i.test(storageRunbook), 'Storage runbook documents PII handling, retention, and restore rehearsal.');
  assert(recursivConfig.includes('verifyRecursivProjectAuth') && recursivConfig.includes('/api/v1/users/me') && recursivConfig.includes('/api/v1/databases') && recursivConfig.includes('projectAccess'), 'Recursiv project auth verifier checks both API-key validity and IQ WARS project access.');
  assert(recursivConfig.includes('RECURSIV_AUTH_CACHE_MS') && recursivConfig.includes('__iqwarsRecursivProjectAuthPromise') && recursivConfig.includes('rate_limit_deferred') && recursivConfig.includes('isRateLimitError'), 'Recursiv project auth verifier caches successful readiness, shares in-flight checks, and fails open only on provider rate limits so health probes do not self-DOS launch readiness.');
  assert(health.includes('launchReady') && health.includes('verified') && health.includes('verifyRecursivProjectAuth') && health.includes('recursivConfiguredButBroken'), 'Health API exposes launch readiness and fails broken persistent storage or configured Recursiv auth.');
  assert(ready.includes('launchReady ? 200 : 503') && ready.includes('verifyPersistentStore') && ready.includes('verifyRecursivProjectAuth') && ready.includes('cache-control'), 'Readiness API returns 503 until persistent storage and Recursiv project access are launch-ready.');
  assert(packageJson.includes('"smoke:prod": "node scripts/smoke-iqwars-prod.mjs --origin https://iqwars.app"'), 'Package scripts expose a production readiness smoke command.');
  assert(prodSmoke.includes('/api/health') && prodSmoke.includes('/api/ready') && prodSmoke.includes('launchReady') && prodSmoke.includes('projectAccess'), 'Production smoke checks health, readiness, launchReady, and Recursiv project access.');
  assert(prodSmoke.includes('/api/version') && prodSmoke.includes('deployed commit') && prodSmoke.includes('shortCommit'), 'Production smoke checks deployed commit metadata.');
  assert(prodSmoke.includes('assertNoStore') && prodSmoke.includes('cache-control') && prodSmoke.includes('no-store'), 'Production smoke verifies no-store cache headers on dynamic readiness APIs.');
  assert(prodSmoke.includes('non-ephemeral storage') && prodSmoke.includes('persistent storage') && prodSmoke.includes('storage provider'), 'Production smoke fails non-persistent or ephemeral storage providers.');
  assert(prodSmoke.includes('criticalRoutes') && prodSmoke.includes('/research') && prodSmoke.includes('/privacy') && prodSmoke.includes('/terms') && prodSmoke.includes('/api/leaderboards?agents=false'), 'Production smoke checks critical public routes and live leaderboard payload.');
  assert(packageJson.includes('"deploy:prove": "node scripts/prove-iqwars-deploy.mjs --origin https://iqwars.app"'), 'Package scripts expose the production deploy no-downtime proof command.');
  assert(deployProof.includes('/api/health') && deployProof.includes('/api/ready') && deployProof.includes('/api/version') && deployProof.includes('launchReady'), 'Deploy proof continuously probes health, readiness, and deployed commit metadata.');
  assert(deployProof.includes('/deploy?uuid=') && deployProof.includes('COOLIFY_API_TOKEN') && deployProof.includes('IQWARS_COOLIFY_APP_UUID') && deployProof.includes('--trigger'), 'Deploy proof can trigger and poll the Coolify app deployment when operator credentials are supplied.');
  assert(deployProof.includes('No-downtime deploy proof passed') && deployProof.includes('outageSamples') && deployProof.includes('Final deployed commit does not match expected commit'), 'Deploy proof fails closed on downtime samples or deployed-commit mismatch.');
  assert(packageJson.includes('"audit:launch:authenticated": "node scripts/run-authenticated-launch-audit.mjs --origin https://iqwars.app"') && authenticatedLaunchAudit.includes("'projects:read'") && authenticatedLaunchAudit.includes('IQWARS_AUDIT_PLAYER_API_KEY') && authenticatedLaunchAudit.includes('Project-scoped audit key creation failed'), 'Package scripts expose a redacted authenticated launch audit runner that mints correctly scoped IQ WARS audit player keys.');
  assert([leaderboard, attempts, username, profiles, roomMessages, presence].every((route) => route.includes('updateJsonStore')), 'Mutable app APIs use serialized JSON store updates.');
  assert(reminders.includes('updateReminderStore') && remindersSend.includes('updateReminderStore'), 'Reminder signup and send flows use serialized reminder store updates.');
  assert(rateLimit.includes("STORE_KEY = 'world-iq:rate-limits:v1'") && rateLimit.includes('updateJsonStore') && rateLimit.includes('retry-after') && rateLimit.includes('status: 429'), 'Shared rate-limit helper stores durable buckets and returns standard 429 responses.');
  const rateLimitedRoutes = [leaderboard, attempts, username, profiles, roomMessages, reminders, checkout, authSend, authVerify, xVerify];
  assert(rateLimitedRoutes.every((route) => route.includes('enforceRateLimit')), 'Public write-heavy APIs enforce rate limits before expensive or persistent side effects.');
  assert(authSend.includes('auth:send-code:email') && authVerify.includes('auth:verify-code') && reminders.includes('reminders:post:email') && checkout.includes('checkout:post'), 'Auth, reminder, and checkout routes have route-specific anti-abuse buckets.');
  assert(username.includes("bucket: 'username:claim'") && attempts.includes("bucket: 'attempts:post'") && leaderboard.includes("bucket: 'leaderboards:post'") && roomMessages.includes("bucket: 'rooms:messages:post'"), 'Gameplay/social write routes rate-limit by stable player, account, or room identity.');
  assert(audit.includes('persistent && verified && launchReady') && audit.includes('Promise.all') && audit.includes('race-safe'), 'Launch audit includes persistent-only concurrent write race checks.');
  assert(audit.includes('Live username API rate-limits repeated claim attempts') && audit.includes('response.status === 429'), 'Launch audit includes a live rate-limit 429 proof.');
  assert(audit.includes('attemptFuzzCases') && audit.includes('leaderboardFuzzCases') && audit.includes('Live attempt API rejects malformed scoring fuzz payloads') && audit.includes('Live leaderboard API rejects malformed scoring fuzz payloads'), 'Launch audit includes deterministic malformed scoring fuzz cases.');
  assert(audit.includes('Live durable leaderboard/geography readback skipped because storage is ephemeral.') && audit.includes('Live durable leaderboard/geography readback cannot be verified without persistent storage.'), 'Live audit only treats durable leaderboard/geography readback as required when persistent storage is configured.');
  assert(audit.includes('IQWARS_AUDIT_PLAYER_API_KEY') && audit.includes('Live authenticated social-write success checks skipped'), 'Live audit only runs authenticated social-write success checks with a real audit player key.');
  assert(audit.includes("['/privacy'") && audit.includes("['/terms'") && audit.includes("['/blog/best-online-iq-test'") && audit.includes('assertLivePage'), 'Live audit covers the public page route surface.');
  assert(audit.includes('assertLiveAdSensePage') && audit.includes('/blog/can-iq-puzzles-make-you-smarter') && audit.includes('keeps ads safely disabled without loading the Google ad script'), 'Live audit covers configured and disabled AdSense page behavior.');

  if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL && !process.env.REDIS_URL && !process.env.IQWARS_DATABASE_URL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    const message = 'No persistent store env is visible in this shell; production must configure Redis/KV/Postgres or leaderboard/map/profile writes are only ephemeral per runtime.';
    if (requirePersistent && !runLive) failures.push(message);
    else if (!runLive) warn(message);
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120)}`);
  }
  return { response, data };
}

async function assertRejectedJsonPost(url, body, message) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
  const result = await requestJson(url, init);
  assert(result.response.status === 400, message);
}

async function requestText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function assertLivePage(route, expectedSnippets, message) {
  const page = await requestText(`${origin}${route}`);
  assert(page.response.ok && expectedSnippets.every((snippet) => page.text.includes(snippet)), message);
  return page;
}

function assertLiveAdSensePage(page, route) {
  const hasAdScript = page.text.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
  const hasSlot = page.text.includes('class="adsbygoogle"') && page.text.includes('data-ad-client=') && page.text.includes('data-ad-slot=');
  const hasPlaceholder = page.text.includes('IQ WARS supports free daily play with sponsorship and ads.');
  if (hasAdScript || hasSlot) {
    assert(hasAdScript && hasSlot && !hasPlaceholder, `Live ${route} renders a configured AdSense script and slot without fallback copy.`);
  } else {
    assert(hasPlaceholder && !page.text.includes('pagead/js/adsbygoogle.js'), `Live ${route} keeps ads safely disabled without loading the Google ad script.`);
  }
}

async function requestRedirect(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return {
    response,
    location: response.headers.get('location') || '',
  };
}

async function liveAudit() {
  const group = `audit-${randomUUID().slice(0, 8)}`;
  const playerId = `audit-player-${randomUUID()}`;
  const username = `audit_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const profileSlug = `${username}_profile`;
  const spoofProfileSlug = `${username}_spoof_profile`;
  const roomBody = `audit message ${randomUUID().slice(0, 8)}`;
  const day = utcDayKey();
  const invalidFutureDay = '2099-12-31';
  const geo = {
    country: 'United States',
    countryCode: 'US',
    region: 'New York',
    city: 'New York',
    town: 'New York',
    timeZone: 'America/New_York',
    source: 'audit',
  };
  const auditPlayerApiKey = process.env.IQWARS_AUDIT_PLAYER_API_KEY || '';
  const canAuditAuthenticatedSocialWrites = Boolean(auditPlayerApiKey);
  const playerCookieHeaders = { Cookie: `iqwars_player_api_key=${auditPlayerApiKey || 'audit-player-key'}` };

  const before = await requestJson(`${origin}/api/leaderboards?day=${day}&group=${group}&agents=false`);
  assert(before.response.ok, 'Live leaderboard GET accepts agents=false.');
  const beforeRows = [...(before.data.global || []), ...(before.data.group || [])];
  assert(!beforeRows.some((row) => String(row.playerId || '').startsWith('agent-')), 'Live agents=false response contains no seeded agents before submit.');
  const defaultAgentBoard = await requestJson(`${origin}/api/leaderboards?day=${day}`);
  assert(
    defaultAgentBoard.response.ok && (defaultAgentBoard.data.global || []).some((row) => String(row.playerId || '').startsWith('agent-')),
    'Live leaderboard API includes seeded agents only when the agents=false filter is omitted.'
  );
  const farFutureBoard = await requestJson(`${origin}/api/leaderboards?day=${invalidFutureDay}&agents=false`);
  assert(farFutureBoard.response.status === 400, 'Live leaderboard API rejects arbitrary future board days.');

  const health = await requestJson(`${origin}/api/health`);
  assert(health.response.ok && health.data.ok === true, 'Live health endpoint responds when storage is not misconfigured.');
  const persistent = Boolean(health.data.storage?.persistent);
  const verified = Boolean(health.data.storage?.verified);
  const storageLaunchReady = Boolean(health.data.storage?.launchReady);
  const provider = String(health.data.storage?.provider || 'unknown');
  const recursivConfigured = Boolean(health.data.recursiv?.configured);
  const recursivVerified = Boolean(health.data.recursiv?.verified);
  const recursivProjectAccess = Boolean(health.data.recursiv?.projectAccess);
  const recursivLaunchReady = recursivConfigured && recursivVerified && recursivProjectAccess;
  const launchReady = Boolean(health.data.launchReady) && storageLaunchReady && recursivLaunchReady;
  if (persistent && verified && storageLaunchReady) {
    pass(`Live storage is persistent and round-trip verified (${provider}).`);
  } else if (requirePersistent) {
    failures.push(`Live storage is not launch-persistent and verified (${provider}); configure Redis/KV/Postgres envs before launch.`);
  } else {
    warn(`Live storage is not launch-persistent and verified (${provider}); configure Redis/KV/Postgres envs before launch.`);
  }
  if (recursivLaunchReady) {
    pass('Live Recursiv API key is valid and can access the IQ WARS project.');
  } else if (requirePersistent) {
    failures.push(`Live Recursiv project auth is not launch-ready (${health.data.recursiv?.error || 'not_ready'}).`);
  } else {
    warn(`Live Recursiv project auth is not launch-ready (${health.data.recursiv?.error || 'not_ready'}).`);
  }

  const ready = await requestJson(`${origin}/api/ready`);
  if (persistent && verified && launchReady) {
    assert(ready.response.ok && ready.data.ok === true && ready.data.launchReady === true, 'Live readiness endpoint passes only when storage and Recursiv project access are verified.');
  } else {
    assert(ready.response.status === 503 && ready.data.launchReady === false, 'Live readiness endpoint fails closed until storage and Recursiv project access are verified.');
  }

  const version = await requestJson(`${origin}/api/version`);
  const liveCommit = String(version.data?.commit || '');
  assert(version.response.ok && version.data?.ok === true && version.data?.app === 'iqwars', 'Live version endpoint returns IQ WARS deployment metadata.');
  assert(version.response.headers.get('cache-control')?.includes('no-store'), 'Live version endpoint is not cached as stale deployment state.');
  assert(/^[a-f0-9]{7,40}$/.test(liveCommit) && typeof version.data?.shortCommit === 'string', 'Live version endpoint exposes a sanitized deployed commit.');
  if (expectedCommit) {
    assert(liveCommit.startsWith(expectedCommit.toLowerCase().slice(0, Math.min(12, expectedCommit.length))), 'Live version endpoint matches the expected deployed commit.');
  }

  const usernameInvalid = await requestJson(`${origin}/api/username?username=ab`);
  assert(usernameInvalid.response.status === 400, 'Live username API rejects invalid short handles.');
  const usernameAvailable = await requestJson(`${origin}/api/username?username=${username}`);
  assert(usernameAvailable.response.ok && usernameAvailable.data.available === true, 'Live username API reports a fresh audit handle as available.');
  const usernameClaim = await requestJson(`${origin}/api/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, playerId, displayName: 'Audit Player' }),
  });
  assert(usernameClaim.response.ok && usernameClaim.data.claim?.username === username, 'Live username API claims a valid handle.');
  const usernameDuplicate = await requestJson(`${origin}/api/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, playerId: `${playerId}-other`, displayName: 'Other Audit' }),
  });
  assert(usernameDuplicate.response.status === 409, 'Live username API rejects duplicate handle claims from another player.');

  const ratePlayerId = `audit-rate-player-${randomUUID()}`;
  const ratePrefix = `rl_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const rateLimitClaims = [];
  for (let index = 0; index < 7; index += 1) {
    rateLimitClaims.push(await requestJson(`${origin}/api/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `${ratePrefix}_${index}`, playerId: ratePlayerId, displayName: 'Rate Audit' }),
    }));
  }
  assert(rateLimitClaims.slice(0, 6).every((claim) => claim.response.ok) && rateLimitClaims[6]?.response.status === 429, 'Live username API rate-limits repeated claim attempts.');

  if (persistent && verified && launchReady) {
    const raceUsername = `race_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const raceClaims = await Promise.all([
      requestJson(`${origin}/api/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: raceUsername, playerId: `${playerId}-race-a`, displayName: 'Race A' }),
      }),
      requestJson(`${origin}/api/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: raceUsername, playerId: `${playerId}-race-b`, displayName: 'Race B' }),
      }),
    ]);
    const acceptedRaceClaims = raceClaims.filter((claim) => claim.response.ok && claim.data.claim?.username === raceUsername);
    const rejectedRaceClaims = raceClaims.filter((claim) => claim.response.status === 409);
    assert(acceptedRaceClaims.length === 1 && rejectedRaceClaims.length === 1, 'Live persistent username claims are race-safe under concurrent duplicate requests.');
  }

  const unauthenticatedProfilePost = await requestJson(`${origin}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `${playerId}-anonymous-profile`,
      slug: `${profileSlug}_anonymous`,
      username: `${username}_anonymous`,
      displayName: 'Anonymous Profile',
    }),
  });
  assert(unauthenticatedProfilePost.response.status === 401, 'Live profile API rejects anonymous profile writes.');

  if (canAuditAuthenticatedSocialWrites) {
    const profilePost = await requestJson(`${origin}/api/profiles`, {
      method: 'POST',
      headers: { ...playerCookieHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: playerId,
        slug: profileSlug,
        username,
        displayName: 'Audit Player',
        bio: 'Launch audit profile',
        city: 'New York',
        country: 'United States',
        score: 137,
        best: 137,
        rank: '#13,700',
        attempts: 1,
        answers: 12,
        profilePublic: true,
        showLocation: true,
        showXBadge: false,
        showHistory: true,
      }),
    });
    assert(profilePost.response.ok && profilePost.data.profile?.slug === profileSlug, 'Live profile API accepts a public audit profile.');
    const profileGet = await requestJson(`${origin}/api/profiles?slug=${profileSlug}`);
    assert(profileGet.response.ok && profileGet.data.profile?.score === 137 && profileGet.data.profile?.city === 'New York', 'Live profile API reads the submitted public profile with visible location.');

    const spoofProfilePost = await requestJson(`${origin}/api/profiles`, {
      method: 'POST',
      headers: { ...playerCookieHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `${playerId}-spoof`,
        slug: spoofProfileSlug,
        username: `${username}_spoof`,
        displayName: 'Spoof Audit',
        bio: 'Spoof profile should be normalized',
        city: 'New York',
        country: 'United States',
        xHandle: 'audit_x',
        xVerified: true,
        score: 999,
        best: 1000,
        rank: 'not-a-rank',
        attempts: 9999,
        answers: 999999,
        profilePublic: true,
        showLocation: true,
        showXBadge: true,
        showHistory: true,
        agent: true,
      }),
    });
    assert(spoofProfilePost.response.ok, 'Live profile API accepts but sanitizes a spoofed profile payload.');
    const spoofProfileGet = await requestJson(`${origin}/api/profiles?slug=${spoofProfileSlug}`);
    const spoofProfile = spoofProfileGet.data?.profile || {};
    assert(
      spoofProfileGet.response.ok
      && spoofProfile.xVerified === false
      && spoofProfile.agent !== true
      && spoofProfile.score <= 155
      && spoofProfile.best <= 155
      && spoofProfile.attempts <= 60
      && spoofProfile.answers <= 720
      && spoofProfile.rank === null,
      'Live profile API strips spoofed badges/agent flags and clamps impossible score history.'
    );
  } else {
    const invalidProfilePost = await requestJson(`${origin}/api/profiles`, {
      method: 'POST',
      headers: { ...playerCookieHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: playerId,
        slug: profileSlug,
        username,
        displayName: 'Audit Player',
      }),
    });
    assert([401, 503].includes(invalidProfilePost.response.status), 'Live profile API rejects invalid player-key cookies.');
    warn('Live authenticated social-write success checks skipped because IQWARS_AUDIT_PLAYER_API_KEY is not configured.');
  }

  const nonProjectApiKey = process.env.RECURSIV_API_KEY && process.env.RECURSIV_API_KEY !== auditPlayerApiKey
    ? process.env.RECURSIV_API_KEY
    : '';
  if (nonProjectApiKey) {
    const nonProjectProfilePost = await requestJson(`${origin}/api/profiles`, {
      method: 'POST',
      headers: { Cookie: `iqwars_player_api_key=${nonProjectApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: playerId,
        slug: `${profileSlug}-nonproject`,
        username,
        displayName: 'Non Project Key',
      }),
    });
    assert([401, 503].includes(nonProjectProfilePost.response.status), 'Live profile API rejects Recursiv keys without IQ WARS project access.');
  }

  const roomMissing = await requestJson(`${origin}/api/rooms/messages`);
  assert(roomMissing.response.status === 400, 'Live room message API rejects missing room reads.');
  const unauthenticatedRoomPost = await requestJson(`${origin}/api/rooms/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode: group, playerId, displayName: 'Audit Player', username, body: roomBody }),
  });
  assert(unauthenticatedRoomPost.response.status === 401, 'Live room message API rejects anonymous room chat writes.');
  const roomPost = await requestJson(`${origin}/api/rooms/messages`, {
    method: 'POST',
    headers: { ...playerCookieHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode: group, playerId, displayName: 'Audit Player', username, body: roomBody }),
  });
  if (canAuditAuthenticatedSocialWrites) {
    assert(roomPost.response.ok && roomPost.data.message?.body === roomBody, 'Live room message API accepts a sanitized room message.');
    const roomGet = await requestJson(`${origin}/api/rooms/messages?group=${group}`);
    assert(roomGet.response.ok && (roomGet.data.messages || []).some((message) => message.body === roomBody), 'Live room message API reads messages for the requested room.');
  } else {
    assert([401, 503].includes(roomPost.response.status), 'Live room message API rejects invalid player-key cookies.');
    const roomGet = await requestJson(`${origin}/api/rooms/messages?group=${group}`);
    assert(roomGet.response.ok, 'Live room message API still allows public room reads after invalid write rejection.');
  }

  const presenceMissing = await requestJson(`${origin}/api/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(presenceMissing.response.status === 400, 'Live presence API rejects missing session/player ids.');
  const presencePost = await requestJson(`${origin}/api/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: `audit-session-${randomUUID()}`, playerId, username, path: `/g/${group}` }),
  });
  assert(presencePost.response.ok && Number(presencePost.data.active) >= 1, 'Live presence API records a heartbeat and returns active count.');
  const presenceLoadSessions = await Promise.all(Array.from({ length: 8 }, (_item, index) => requestJson(`${origin}/api/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: `audit-load-session-${randomUUID()}-${index}`, playerId: `${playerId}-presence-${index}`, username, path: `/g/${group}?ignored=true` }),
  })));
  const activeAfterPresenceLoad = Math.max(...presenceLoadSessions.map((item) => Number(item.data?.active) || 0));
  assert(presenceLoadSessions.every((item) => item.response.ok) && activeAfterPresenceLoad >= 8, 'Live presence API handles concurrent heartbeat load and counts active sessions.');

  const reminderInvalid = await requestJson(`${origin}/api/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert(reminderInvalid.response.status === 400, 'Live reminders API rejects invalid email input.');

  const reminderSendNoAuth = await requestJson(`${origin}/api/reminders/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert([401, 503].includes(reminderSendNoAuth.response.status), 'Live reminder cron send API is not open without authorization/configuration.');

  const accessNoCookie = await requestJson(`${origin}/api/access`);
  assert(accessNoCookie.response.ok && accessNoCookie.data.active === false, 'Live access API returns inactive without a player account cookie.');

  const billingConfigLive = await requestJson(`${origin}/api/billing/config`);
  assert(billingConfigLive.response.ok && typeof billingConfigLive.data?.checkoutReady === 'boolean', 'Live billing config API returns checkout readiness.');
  assert(!Object.prototype.hasOwnProperty.call(billingConfigLive.data || {}, 'paymentLinkUrl') && !Object.prototype.hasOwnProperty.call(billingConfigLive.data || {}, 'url'), 'Live billing config API does not expose hosted checkout URLs.');
  if (billingConfigLive.data?.checkoutReady) {
    pass(`Live billing config exposes configured checkout provider (${billingConfigLive.data.provider || 'unknown'}).`);
  } else {
    warn('Live billing config is not checkout-ready; paid upgrade remains optional but cannot be A+ until a provider is configured.');
  }

  const checkoutNoCookie = await requestJson(`${origin}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl: `${origin}/rankings` }),
  });
  assert(checkoutNoCookie.response.status === 401, 'Live checkout API requires an IQ WARS player account cookie.');

  const checkoutStatusNoCookie = await requestJson(`${origin}/api/checkout-status?tier=plus`);
  assert(checkoutStatusNoCookie.response.status === 401, 'Live checkout status API requires an IQ WARS player account cookie.');

  const authSendInvalid = await requestJson(`${origin}/api/recursiv-auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invalid' }),
  });
  assert(authSendInvalid.response.status === 400, 'Live email auth send route rejects invalid emails before hitting Recursiv.');

  const authVerifyInvalid = await requestJson(`${origin}/api/recursiv-auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invalid', code: '1' }),
  });
  assert(authVerifyInvalid.response.status === 400, 'Live email auth verify route rejects invalid email/code input before hitting Recursiv.');

  const xConnectNotConfigured = await requestRedirect(`${origin}/api/x/connect?returnTo=/rankings`);
  assert([301, 302, 303, 307, 308].includes(xConnectNotConfigured.response.status) && xConnectNotConfigured.location.includes('/rankings') && xConnectNotConfigured.location.includes('x_status=not_configured'), 'Live X connect route redirects safely when X auth is not configured.');

  const xCallbackFailed = await requestRedirect(`${origin}/api/x/callback?state=bad&code=bad`);
  assert([301, 302, 303, 307, 308].includes(xCallbackFailed.response.status) && xCallbackFailed.location.includes('x_status=failed'), 'Live X callback rejects missing/invalid state before token exchange.');

  const xVerifyMissing = await requestJson(`${origin}/api/x/verify-post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(xVerifyMissing.response.status === 400, 'Live X post verification route rejects missing handle/token before hitting X.');

  const farFutureAttempt = await requestJson(`${origin}/api/attempts?day=${invalidFutureDay}&playerId=${encodeURIComponent(playerId)}`);
  assert(farFutureAttempt.response.status === 400, 'Live attempt API rejects arbitrary future attempt days.');

  const impossibleAttempt = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId: `${playerId}-impossible`,
      correct: 13,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
    }),
  });
  assert(impossibleAttempt.response.status === 400, 'Live attempt API rejects impossible correct totals.');

  const impossibleBeatAiAttempt = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId: `${playerId}-bad-beatai`,
      correct: 2,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
    }),
  });
  assert(impossibleBeatAiAttempt.response.status === 400, 'Live attempt API rejects impossible AI-beat counts.');

  const attemptFuzzCases = [
    ['malformed JSON', '{not-json'],
    ['missing player', { day, correct: 5, total: 12, beatAi: 1, elapsedMs: 270000 }],
    ['non-finite correct count', { day, playerId: `${playerId}-fuzz-nan-correct`, correct: 'NaN', total: 12, beatAi: 1, elapsedMs: 270000 }],
    ['invalid total shape', { day, playerId: `${playerId}-fuzz-bad-total`, correct: 5, total: { value: 12 }, beatAi: 1, elapsedMs: 270000 }],
    ['invalid AI-beat shape', { day, playerId: `${playerId}-fuzz-bad-ai`, correct: 5, total: 12, beatAi: { count: 1 }, elapsedMs: 270000 }],
  ];
  for (const [label, body] of attemptFuzzCases) {
    await assertRejectedJsonPost(`${origin}/api/attempts`, body, `Live attempt API rejects malformed scoring fuzz payloads: ${label}.`);
  }

  const attempt = {
    day,
    playerId,
    score: 200,
    rank: '#1',
    percentile: 99.9,
    correct: 10,
    total: 12,
    beatAi: 3,
    elapsedMs: 270000,
    speedBonus: 50,
  };
  const attemptPost = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attempt),
  });
  assert(attemptPost.response.ok && attemptPost.data.accepted === true && attemptPost.data.locked === true, 'Live attempt API accepts the first official attempt lock.');
  assert(attemptPost.data.attempt?.score === 137 && attemptPost.data.attempt?.rank === '#30,000' && attemptPost.data.attempt?.speedBonus === 4, 'Live attempt API stores canonical server-derived score metadata.');

  const attemptDuplicate = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...attempt, score: 99, correct: 1, beatAi: 0 }),
  });
  assert(attemptDuplicate.response.ok && attemptDuplicate.data.accepted === false && attemptDuplicate.data.attempt?.score === 137, 'Live attempt API rejects duplicate official attempts for the same player/day.');

  if (persistent && verified && launchReady) {
    const racePlayerId = `audit-race-player-${randomUUID()}`;
    const raceAttempt = { ...attempt, playerId: racePlayerId };
    const raceAttempts = await Promise.all([
      requestJson(`${origin}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...raceAttempt, score: 136, correct: 9 }),
      }),
      requestJson(`${origin}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...raceAttempt, score: 101, correct: 2, beatAi: 1 }),
      }),
    ]);
    const acceptedRaceAttempts = raceAttempts.filter((item) => item.response.ok && item.data.accepted === true);
    const rejectedRaceAttempts = raceAttempts.filter((item) => item.response.ok && item.data.accepted === false);
    const raceAttemptGet = await requestJson(`${origin}/api/attempts?day=${raceAttempt.day}&playerId=${encodeURIComponent(racePlayerId)}`);
    assert(acceptedRaceAttempts.length === 1 && rejectedRaceAttempts.length === 1 && raceAttemptGet.data.attempt?.score === acceptedRaceAttempts[0]?.data.attempt?.score, 'Live persistent attempt locks are race-safe under concurrent duplicate requests.');
  }

  const attemptGet = await requestJson(`${origin}/api/attempts?day=${day}&playerId=${encodeURIComponent(playerId)}`);
  assert(attemptGet.response.ok && attemptGet.data.locked === true && attemptGet.data.attempt?.playerId === playerId, 'Live attempt API reads back the server-side daily lock.');

  const futureLeaderboardWrite = await requestJson(`${origin}/api/leaderboards?agents=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day: invalidFutureDay,
      playerId: `${playerId}-future`,
      displayName: 'Future Audit',
      score: 137,
      rank: '#13,700',
      percentile: 98.63,
      correct: 10,
      total: 12,
      beatAi: 3,
      elapsedMs: 390000,
      speedBonus: 2,
      geo,
    }),
  });
  assert(futureLeaderboardWrite.response.status === 400, 'Live leaderboard API rejects arbitrary future score writes.');

  const impossibleLeaderboardWrite = await requestJson(`${origin}/api/leaderboards?agents=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId: `${playerId}-bad-score`,
      displayName: 'Bad Score Audit',
      score: 200,
      rank: '#1',
      percentile: 99.9,
      correct: 13,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
      speedBonus: 50,
      geo,
    }),
  });
  assert(impossibleLeaderboardWrite.response.status === 400, 'Live leaderboard API rejects impossible correct totals.');

  const impossibleBeatAiLeaderboardWrite = await requestJson(`${origin}/api/leaderboards?agents=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId: `${playerId}-bad-ai-count`,
      displayName: 'Bad AI Count Audit',
      score: 120,
      rank: '#100,000',
      percentile: 90,
      correct: 2,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
      speedBonus: 4,
      geo,
    }),
  });
  assert(impossibleBeatAiLeaderboardWrite.response.status === 400, 'Live leaderboard API rejects impossible AI-beat counts.');

  const leaderboardFuzzCases = [
    ['malformed JSON', '{not-json'],
    ['missing player', { day, displayName: 'Missing Player', correct: 5, total: 12, beatAi: 1, elapsedMs: 270000, geo }],
    ['non-finite correct count', { day, playerId: `${playerId}-leader-fuzz-nan-correct`, displayName: 'NaN Correct', correct: 'NaN', total: 12, beatAi: 1, elapsedMs: 270000, geo }],
    ['invalid total shape', { day, playerId: `${playerId}-leader-fuzz-bad-total`, displayName: 'Bad Total', correct: 5, total: { value: 12 }, beatAi: 1, elapsedMs: 270000, geo }],
    ['invalid AI-beat shape', { day, playerId: `${playerId}-leader-fuzz-bad-ai`, displayName: 'Bad AI', correct: 5, total: 12, beatAi: ['x'], elapsedMs: 270000, geo }],
  ];
  for (const [label, body] of leaderboardFuzzCases) {
    await assertRejectedJsonPost(`${origin}/api/leaderboards?agents=false`, body, `Live leaderboard API rejects malformed scoring fuzz payloads: ${label}.`);
  }

  const post = await requestJson(`${origin}/api/leaderboards?agents=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day,
      playerId,
      displayName: 'Audit Player',
      username: 'audit_player',
      groupCode: group,
      groupName: 'Audit Room',
      score: 200,
      rank: '#1',
      percentile: 99.9,
      correct: 10,
      total: 12,
      beatAi: 3,
      elapsedMs: 270000,
      speedBonus: 50,
      geo,
    }),
  });
  assert(post.response.ok && post.data.accepted === true, 'Live leaderboard POST accepts a real same-day audit entry.');
  assert(post.data.entry?.score === 137 && post.data.entry?.rank === '#30,000' && post.data.entry?.speedBonus === 4, 'Live leaderboard API stores canonical server-derived score metadata.');

  const after = await requestJson(`${origin}/api/leaderboards?day=${day}&group=${group}&agents=false`);
  const globalRows = after.data.global || [];
  const groupRows = after.data.group || [];
  const allRows = [...globalRows, ...groupRows];
  assert(after.response.ok, 'Live leaderboard GET succeeds after submit.');
  assert(!allRows.some((row) => String(row.playerId || '').startsWith('agent-')), 'Live agents=false response still excludes seeded agents after submit.');
  if (persistent && verified && storageLaunchReady) {
    assert(globalRows.some((row) => row.playerId === playerId), 'Live global board includes the submitted real player.');
    assert(groupRows.some((row) => row.playerId === playerId && row.groupCode === group), 'Live friend room board includes only the submitted room player.');
    assert((after.data.groupAllTime || []).some((row) => row.playerId === playerId && row.groupCode === group), 'Live friend room all-time records include the submitted room player.');
    assert((after.data.geography?.countries || []).some((row) => row.label === 'United States' || row.id === 'US'), 'Live geography countries include submitted geo.');
    assert((after.data.geography?.cities || []).some((row) => row.label === 'New York'), 'Live geography cities include submitted geo.');
    assert((after.data.geography?.towns || []).some((row) => row.label === 'New York'), 'Live geography towns include submitted geo.');
  } else if (requirePersistent) {
    failures.push('Live durable leaderboard/geography readback cannot be verified without persistent storage.');
  } else {
    warn('Live durable leaderboard/geography readback skipped because storage is ephemeral.');
  }

  const geoCheck = await requestJson(`${origin}/api/geo?tz=America%2FNew_York&locale=en-US`);
  assert(geoCheck.response.ok && geoCheck.data.countryCode === 'US', 'Live geo endpoint infers country from browser locale fallback.');
  assert(geoCheck.response.ok && Boolean(geoCheck.data.city || geoCheck.data.town), 'Live geo endpoint returns usable city/town signal from edge or timezone data.');

  const agentManifest = await requestJson(`${origin}/api/agents/manifest`);
  assert(agentManifest.response.ok && agentManifest.data.status === 'evaluation_contract_ready', 'Live agent manifest route exposes an evaluation-ready machine-readable contract.');
  assert(agentManifest.response.headers.get('cache-control')?.includes('no-store'), 'Live agent manifest route is not cached as stale policy.');
  assert(agentManifest.data.humanFirstPolicy?.loggedOutAgentsRouteBehavior === 'account_gate' && agentManifest.data.humanFirstPolicy?.privateRoomPolicy === 'agents_excluded', 'Live agent manifest keeps public visitors on the daily test and excludes agents from private rooms.');
  assert(agentManifest.data.leaderboardAccess?.humansDefault?.includes('agents=false') && agentManifest.data.leaderboardAccess?.disclosedAgentsOptIn?.endsWith('/api/leaderboards'), 'Live agent manifest documents human-default and disclosed-agent opt-in leaderboard access.');
  assert(Array.isArray(agentManifest.data.agentDisclosureRequired) && agentManifest.data.agentDisclosureRequired.includes('model') && agentManifest.data.agentDisclosureRequired.includes('toolPermissions') && agentManifest.data.agentDisclosureRequired.includes('retryPolicy'), 'Live agent manifest requires model, tool, and retry-policy disclosure.');

  const groupPage = await requestText(`${origin}/g/${group}`);
  assert(groupPage.response.ok && groupPage.text.includes('Audit') && /Room records|All-time room highscores|Best scores ever in this room/.test(groupPage.text), 'Live /g/[group] route renders the unique group rankings and room records.');
  assert(groupPage.text.includes('menu-mark') && groupPage.text.includes('command-toggle') && !groupPage.text.includes('class="jsx-56ed461b0709d1ed command-id"'), 'Live nav renders as an icon sidebar launcher, not a cramped identity dropdown.');
  assert(
    /Today resets daily/.test(groupPage.text) && /No friends have locked today|Private rooms start empty|room board/.test(groupPage.text),
    'Live friend room copy keeps room membership invite-only and real-player focused.'
  );

  const rankings = await requestText(`${origin}/rankings?g=${group}`);
  assert(rankings.response.ok && rankings.text.includes('Audit') && /friend rankings|Today(?:'|&apos;|&#x27;)s room board|Today resets daily/.test(rankings.text) && /Room records|All-time room highscores|Best scores ever in this room/.test(rankings.text), 'Live rankings route opens the requested friend board with room records.');

  const publicPages = [
    ['/', ['Lock answer'], 'Live home route renders the playable test above the fold.'],
    ['/rankings', ['Live world board', 'Global board'], 'Live rankings route renders the global leaderboard view.'],
    ['/about', ['A daily global reasoning-game ranking', 'Country rankings', 'not clinical IQ diagnoses, educational/admission decisions, employment signals, or proof of innate intelligence'], 'Live about route renders conservative academic/geography positioning.'],
    ['/research', ['Daily abstract reasoning practice', 'clinically raises innate IQ', 'not clinical IQ certification'], 'Live research route renders source-backed conservative research positioning.'],
    ['/agents', ['Connect account to use agent tools.', 'Public visitors should start with the daily test'], 'Live agents route is gated for logged-out visitors.'],
    ['/blog', ['Viral IQ research', 'Search-optimized explainers'], 'Live blog route renders article index content.'],
    ['/blog/best-online-iq-test', ['Best Online IQ Test', 'Why IQ WARS is different'], 'Live blog article route renders a routed article.'],
    ['/blog/can-iq-puzzles-make-you-smarter', ['Can IQ Puzzles Make You Smarter?', 'competitive reasoning signals'], 'Live blog article route renders a research caveat article.'],
    ['/privacy', ['IQ WARS Privacy Policy', 'Recursiv Labs'], 'Live privacy route renders operator and policy text.'],
    ['/terms', ['IQ WARS Terms of Service', 'Fair play'], 'Live terms route renders fair-play terms.'],
    ['/profile', ['Connect account to manage your profile.'], 'Live logged-out profile route renders the account gate.'],
    ['/settings', ['Connect account to manage settings.'], 'Live logged-out settings route renders the account gate.'],
    ['/u/agent_euclid', ['IQ WARS'], 'Live public profile route renders the shell for a profile slug.'],
  ];
  for (const [route, snippets, message] of publicPages) {
    const page = await assertLivePage(route, snippets, message);
    if (['/research', '/blog', '/blog/best-online-iq-test', '/blog/can-iq-puzzles-make-you-smarter'].includes(route)) {
      assertLiveAdSensePage(page, route);
    }
  }
}

await sourceAudit();
if (runLive) await liveAudit();

for (const message of passes) console.log(`PASS ${message}`);
for (const message of warnings) console.warn(`WARN ${message}`);
for (const message of failures) console.error(`FAIL ${message}`);

console.log(JSON.stringify({
  passed: passes.length,
  warnings: warnings.length,
  failures: failures.length,
  live: runLive ? origin : null,
}, null, 2));

if (failures.length) process.exit(1);
