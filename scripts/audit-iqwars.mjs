#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src/app/IqApp.tsx');
const i18nPath = path.join(root, 'src/app/i18n.ts');
const leaderboardPath = path.join(root, 'src/app/api/leaderboards/route.ts');
const attemptsPath = path.join(root, 'src/app/api/attempts/route.ts');
const geoPath = path.join(root, 'src/app/api/geo/route.ts');
const storePath = path.join(root, 'src/app/api/_lib/store.ts');
const healthPath = path.join(root, 'src/app/api/health/route.ts');
const usernamePath = path.join(root, 'src/app/api/username/route.ts');
const profilesPath = path.join(root, 'src/app/api/profiles/route.ts');
const roomMessagesPath = path.join(root, 'src/app/api/rooms/messages/route.ts');
const presencePath = path.join(root, 'src/app/api/presence/route.ts');
const remindersPath = path.join(root, 'src/app/api/reminders/route.ts');
const remindersSendPath = path.join(root, 'src/app/api/reminders/send/route.ts');
const accessPath = path.join(root, 'src/app/api/access/route.ts');
const checkoutPath = path.join(root, 'src/app/api/checkout/route.ts');
const checkoutStatusPath = path.join(root, 'src/app/api/checkout-status/route.ts');
const authSendPath = path.join(root, 'src/app/api/recursiv-auth/send-code/route.ts');
const authVerifyPath = path.join(root, 'src/app/api/recursiv-auth/verify-code/route.ts');
const xConnectPath = path.join(root, 'src/app/api/x/connect/route.ts');
const xCallbackPath = path.join(root, 'src/app/api/x/callback/route.ts');
const xVerifyPath = path.join(root, 'src/app/api/x/verify-post/route.ts');
const apiDaysPath = path.join(root, 'src/app/api/_lib/days.ts');
const apiScoringPath = path.join(root, 'src/app/api/_lib/scoring.ts');
const groupPagePath = path.join(root, 'src/app/g/[group]/page.tsx');
const rankingsPagePath = path.join(root, 'src/app/rankings/page.tsx');
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
const requirePersistent = process.argv.includes('--require-persistent') || process.env.REQUIRE_REDIS === '1';

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

function simulateOfficialQuestionRotation({ ids, starterIds, questionCount, days, playerSeed }) {
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

    for (const id of [...unseen, ...recycled]) {
      if (selected.length >= questionCount) break;
      selected.push(id);
      selectedIds.add(id);
    }

    setHistory = [
      ...selected.filter((id) => ids.includes(id)),
      ...setHistory.filter((id) => ids.includes(id) && !selected.includes(id)),
    ].slice(0, ids.length);
    rounds.push({ day, starterId, selected });
  }

  return rounds;
}

async function sourceAudit() {
  const app = source(appPath);
  const audit = source(fileURLToPath(import.meta.url));
  const i18n = source(i18nPath);
  const leaderboard = source(leaderboardPath);
  const attempts = source(attemptsPath);
  const store = source(storePath);
  const health = source(healthPath);
  const geo = source(geoPath);
  const username = source(usernamePath);
  const profiles = source(profilesPath);
  const roomMessages = source(roomMessagesPath);
  const presence = source(presencePath);
  const reminders = source(remindersPath);
  const remindersSend = source(remindersSendPath);
  const access = source(accessPath);
  const checkout = source(checkoutPath);
  const checkoutStatus = source(checkoutStatusPath);
  const authSend = source(authSendPath);
  const authVerify = source(authVerifyPath);
  const xConnect = source(xConnectPath);
  const xCallback = source(xCallbackPath);
  const xVerify = source(xVerifyPath);
  const apiDays = source(apiDaysPath);
  const apiScoring = source(apiScoringPath);
  const groupPage = source(groupPagePath);
  const rankingsPage = source(rankingsPagePath);
  const { ts, tree } = await parseTs(appPath, (await import('typescript')).ScriptKind.TSX);

  assert(existsSync(appPath), 'IqApp source exists.');
  assert(existsSync(i18nPath), 'I18n source exists.');
  assert(existsSync(leaderboardPath), 'Leaderboard API route exists.');
  assert(existsSync(attemptsPath), 'Server attempt lock API route exists.');
  assert(existsSync(geoPath), 'Geo API route exists.');
  assert(existsSync(storePath), 'Shared JSON/Redis store exists.');
  assert(existsSync(healthPath), 'Storage health API route exists.');
  assert(existsSync(usernamePath), 'Username API route exists.');
  assert(existsSync(profilesPath), 'Profile API route exists.');
  assert(existsSync(roomMessagesPath), 'Room message API route exists.');
  assert(existsSync(presencePath), 'Presence API route exists.');
  assert(existsSync(remindersPath), 'Reminder API route exists.');
  assert(existsSync(remindersSendPath), 'Reminder cron send API route exists.');
  assert(existsSync(accessPath), 'Access API route exists.');
  assert(existsSync(checkoutPath), 'Checkout API route exists.');
  assert(existsSync(checkoutStatusPath), 'Checkout status API route exists.');
  assert(existsSync(authSendPath) && existsSync(authVerifyPath), 'Recursiv email auth API routes exist.');
  assert(existsSync(xConnectPath) && existsSync(xCallbackPath) && existsSync(xVerifyPath), 'X verification API routes exist.');
  assert(existsSync(apiDaysPath), 'Shared API board-day validator exists.');
  assert(existsSync(apiScoringPath), 'Shared API scoring canonicalizer exists.');
  assert(pageRoutePaths.every((routePath) => existsSync(routePath)), 'All public page route files exist.');

  const dailyLimit = initializerText(findVariable(ts, tree, 'DAILY_PLAY_LIMIT'), app);
  assert(dailyLimit === '1', 'Free official play is limited to one completed run per day.');
  const officialQuestionCount = initializerText(findVariable(ts, tree, 'OFFICIAL_QUESTION_COUNT'), app);
  assert(officialQuestionCount === '12', 'Official world run remains a 12-question baseline.');
  const noRepeatDays = initializerText(findVariable(ts, tree, 'MIN_OFFICIAL_NO_REPEAT_DAYS'), app);
  assert(noRepeatDays === '5', 'Official question bank targets at least five full daily runs before repeating questions.');
  const generatedWorldCount = initializerText(findVariable(ts, tree, 'GENERATED_WORLD_PUZZLE_COUNT'), app);
  assert(generatedWorldCount.includes('OFFICIAL_QUESTION_COUNT * MIN_OFFICIAL_NO_REPEAT_DAYS - 24'), 'Generated official puzzle count fills the no-repeat bank beyond the 24 hand-authored puzzles.');
  assert(app.includes('showAgentActivity: false'), 'Seeded agent activity is opt-in by default.');

  const rankedIds = stringArrayFromVariable(ts, tree, 'rankedWorldPuzzleIds');
  const rankedIdsInit = initializerText(findVariable(ts, tree, 'rankedWorldPuzzleIds'), app);
  assert(rankedIds.length >= 60 || rankedIdsInit.includes('worldPuzzles.map((puzzle) => puzzle.id)'), 'Official world mode uses the full proof-checked bank for a five-day no-repeat window.');
  assert(!rankedIds.length || new Set(rankedIds).size === rankedIds.length, 'Explicit official world puzzle id list has no duplicates.');
  assert(app.includes('...generatedWorldPuzzles()'), 'Generated official puzzle items are included in the proof-checked world puzzle bank.');

  const proofChecks = functionText(findFunction(ts, tree, 'withProofChecks'), app);
  assert(proofChecks.includes('solutionProof.checksum') && proofChecks.includes('proofTileSignature'), 'Puzzle answer proofs are checksum-verified at module load.');
  assert(proofChecks.includes('ids.has') && proofChecks.includes('matrix.length !== 9') && proofChecks.includes('filter((item) => item === null).length !== 1'), 'Puzzle proof checks reject duplicate ids and malformed matrices.');
  assert(proofChecks.includes('answerIndex') && proofChecks.includes('options.length < 4') && proofChecks.includes('new Set(puzzle.options.map(tileSignature)).size !== puzzle.options.length'), 'Puzzle proof checks reject invalid answer indexes and duplicate answer options.');
  assert(app.includes('function isValidTile') && proofChecks.includes('isValidTile') && proofChecks.includes('solutionProof.lay.trim()') && proofChecks.includes('solutionProof.formal.trim()'), 'Puzzle proof checks require valid tiles and non-empty proof text.');

  const getQuestions = functionText(findFunction(ts, tree, 'getQuestions'), app);
  assert(getQuestions.includes('stableQuestionOrder(mode, rankedWorldPuzzles') && getQuestions.includes('rankedWorldPuzzles.slice(0, 8)') && getQuestions.includes('OFFICIAL_QUESTION_COUNT'), 'Official question order is stable per day, 12 questions long, and starts from the calibrated starter pool.');
  assert(getQuestions.includes('stableQuestionOrder(mode, agiPuzzles'), 'AGI lab questions use the same stable rotation helper.');

  const chooseStarter = functionText(findFunction(ts, tree, 'chooseStarterId'), app);
  assert(chooseStarter.includes('readQuestionStarterHistory') && chooseStarter.includes('writeQuestionStarterHistory') && chooseStarter.includes('available.length > 0 ? available : candidateIds'), 'Question starters cycle through recent-start history before repeating.');

  const chooseSet = functionText(findFunction(ts, tree, 'chooseQuestionSet'), app);
  assert(chooseSet.includes('readQuestionSetHistory') && chooseSet.includes('writeQuestionSetHistory'), 'Official question sets persist per-player recent question history.');
  assert(chooseSet.includes('unseenPool') && chooseSet.includes('fallbackStarterPool') && chooseSet.includes('history.indexOf(b.id) - history.indexOf(a.id)'), 'Question set selection prefers unseen questions and only recycles least-recently-seen items after the bank is exhausted.');

  const stableOrder = functionText(findFunction(ts, tree, 'stableQuestionOrder'), app);
  assert(stableOrder.includes('readQuestionOrder') && stableOrder.includes('writeQuestionOrder'), 'Daily question order is persisted so refreshes do not reshuffle an active attempt.');
  assert(stableOrder.includes('chooseQuestionSet') && stableOrder.includes('targetCount'), 'Stable question order selects a fixed-size rotating question set before ordering it.');
  const permutedOrder = functionText(findFunction(ts, tree, 'permutedQuestionOrder'), app);
  assert(app.includes('function difficultyRank') && permutedOrder.includes('difficultyRank(a) - difficultyRank(b)') && permutedOrder.includes(':band:'), 'Question order ramps by difficulty after the rotating starter while randomizing within bands.');

  const questionCountNumber = Number(officialQuestionCount);
  const noRepeatDaysNumber = Number(noRepeatDays);
  const officialIds = officialWorldIdsFromSource(app, questionCountNumber, noRepeatDaysNumber);
  const starterIds = officialIds.slice(0, 8);
  const simulatedRounds = simulateOfficialQuestionRotation({
    ids: officialIds,
    starterIds,
    questionCount: questionCountNumber,
    days: noRepeatDaysNumber,
    playerSeed: 'audit-player',
  });
  const simulatedSelections = simulatedRounds.flatMap((round) => round.selected);
  assert(officialIds.length >= questionCountNumber * noRepeatDaysNumber, 'Official question bank has enough source IDs for the promised no-repeat window.');
  assert(simulatedRounds.every((round) => round.selected.length === questionCountNumber && new Set(round.selected).size === questionCountNumber), 'Simulated daily official runs contain the configured number of unique questions.');
  assert(new Set(simulatedSelections).size === simulatedSelections.length, 'Simulated official question rotation has no repeated questions across the full no-repeat window.');
  assert(new Set(simulatedRounds.map((round) => round.starterId)).size === Math.min(noRepeatDaysNumber, starterIds.length), 'Simulated official starter question rotates across consecutive days.');

  const buildGlobe = functionText(findFunction(ts, tree, 'buildGlobeRegions'), app);
  assert(buildGlobe.includes('geography.countries') && buildGlobe.includes('geography.cities.slice') && buildGlobe.includes('geography.towns.slice'), 'Globe regions derive only from ranked geography board rows.');
  assert(app.includes('PLACE_GLOBE_CENTERS') && app.includes('globeCoordinateFromKnownPlace') && app.includes("'city:new york:us'") && app.includes("'city:singapore:sg'"), 'Globe uses real known city/town coordinates before hash fallback.');
  assert(!buildGlobe.includes('fallbackGeo') && !buildGlobe.includes('Local signal') && !buildGlobe.includes('score: 100'), 'Globe heat never fabricates a local fallback region or score.');

  const result = app.slice(app.indexOf('function Result('), app.indexOf('function Runner('));
  assert(result.includes('readOfficialRank()') && result.includes("setResultStatus('practice')"), 'Retakes after a locked daily result are marked practice.');
  assert(result.includes('claimServerOfficialAttempt') && result.includes('syncLocalOfficialLock(officialRank)'), 'First official completion claims the server attempt lock before local official sync.');
  assert(result.includes('consumePlay()'), 'First official completion consumes the daily attempt locally.');
  assert(result.includes('onLeaderboard(entry, officialRank)'), 'Official completion submits into the leaderboard flow.');

  const runner = app.slice(app.indexOf('function Runner('), app.indexOf('export default function Home'));
  assert(runner.includes('readServerOfficialAttempt') && runner.includes('onServerAttemptLocked'), 'Runner syncs server-side daily attempt locks.');

  const handleLeaderboard = app.slice(app.indexOf('function handleLeaderboard'), app.indexOf('const handleUsageChange'));
  assert(handleLeaderboard.includes("navigateView('rankings')"), 'Completing the official run routes the player to rankings.');
  const footer = functionText(findFunction(ts, tree, 'SiteFooter'), app);
  assert(!footer.includes("onView('agents')"), 'Public footer keeps secondary agent tools out of the main logged-out loop.');
  assert(app.includes("view === 'agents' && !recursivAccount") && app.includes('Connect account to use agent tools.'), 'Agent-ready surface is gated behind account connection for logged-out visitors.');

  assert(groupPage.includes('initialGroupCode={params.group}'), 'Friend group route injects the room code into the app.');
  assert(rankingsPage.includes('initialView="rankings"') && rankingsPage.includes("searchParams?.g"), 'Rankings route opens directly into a friend room board from ?g=.');
  assert(app.includes("if (code || !settings.showAgentActivity) params.set('agents', 'false');"), 'Private room leaderboard reads force agents=false.');
  assert(app.includes("if (submittedGroupCode || !settings.showAgentActivity) params.set('agents', 'false');"), 'Private room leaderboard writes force agents=false in the response.');
  assert(app.includes('groupRecords.map((group) => group.code)') && app.includes('randomRoomCode(knownCodes)'), 'New room creation checks current and saved room codes before generating a unique link.');
  assert(app.includes('function groupRoomNumber') && app.includes('groupRoomNumber(group.code)'), 'Friend groups render stable unique room identifiers in the sidebar list.');
  assert(app.includes('return `Group ${groupRoomNumber(code)}`') && app.includes('className="group-room-tag"'), 'Newly created friend groups get stable visible room numbers in the sidebar list.');
  assert(app.includes('function navigateGroupRankings') && app.includes('groupRankingsPath(cleaned)') && app.includes('navigateGroupRankings(cleaned)'), 'Opening a listed friend group lands on its durable rankings URL.');
  assert(app.includes('command-panel sidebar-nav') && app.includes('command-scroll') && app.includes('role="navigation"'), 'Navigation renders as a left sidebar drawer with scrollable app navigation.');
  assert(app.includes('command-room-card') && app.includes('Current room') && app.includes('command-profile-meta'), 'Sidebar includes a structured command-center room and identity summary.');
  assert(app.includes('formatGroupCreatedAt') && app.includes('groupShareUrl(group.code)') && app.includes('Invite-only'), 'Friend groups are listed with distinct invite-only room metadata.');
  assert(app.includes('Active private group') && app.includes('Only people who open this link appear here.') && app.includes('No seeded agents.') && app.includes('Rooms are invite-only and stay empty until real players open your link.'), 'Friend-room UI promises link-only real invited players instead of seeded agents.');

  assert(leaderboard.includes("request.nextUrl.searchParams.get('agents') !== 'false'"), 'Leaderboard API supports agents=false filtering.');
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
  assert(profiles.includes('PLAYER_API_KEY_COOKIE') && profiles.includes('Connect an IQ WARS account before saving a profile.'), 'Profile write API requires a connected IQ WARS account cookie.');
  assert(roomMessages.includes('MAX_ROOM_MESSAGES') && roomMessages.includes('sanitizeBody'), 'Room messages API limits and sanitizes room chat.');
  assert(roomMessages.includes('PLAYER_API_KEY_COOKIE') && roomMessages.includes('Connect an IQ WARS account before posting room chat.'), 'Room chat write API requires a connected IQ WARS account cookie.');
  assert(presence.includes('ACTIVE_WINDOW_MS') && presence.includes('pruneSessions'), 'Presence API prunes stale sessions before counting live users.');
  assert(reminders.includes('validEmail') && reminders.includes('sendConfirmation'), 'Reminder API validates email and stores daily reminders.');
  assert(remindersSend.includes('IQ_REMINDER_CRON_TOKEN') && remindersSend.includes("process.env.NODE_ENV === 'production'"), 'Reminder cron send API requires explicit production configuration.');
  assert(access.includes('PLAYER_API_KEY_COOKIE') && access.includes('app-subscriptions/status'), 'Access API checks Recursiv app subscription status from the player key.');
  assert(checkout.includes('PLAYER_API_KEY_COOKIE') && checkout.includes('safeReturnUrl'), 'Checkout API requires a player key and sanitizes return URLs.');
  assert(checkoutStatus.includes('PLAYER_API_KEY_COOKIE') && checkoutStatus.includes('setAccessCookie'), 'Checkout status API requires a player key and syncs the access cookie.');
  assert(authSend.includes('IQWARS_PROJECT_API_KEY') && authSend.includes('Host: IQWARS_APP_HOST'), 'Email-code send route uses the IQ WARS project key and branded host.');
  assert(authVerify.includes('IQWARS_PROJECT_ID') && authVerify.includes('projectId: IQWARS_PROJECT_ID'), 'Email-code verify route creates project-scoped IQ WARS player keys.');
  assert(xConnect.includes('safeReturnPath') && xConnect.includes('code_challenge_method'), 'X connect route sanitizes returns and uses PKCE.');
  assert(xCallback.includes('expectedState !== state') && xCallback.includes('redirectWithParams'), 'X callback route verifies state and redirects with status params.');
  assert(xVerify.includes('X_BEARER_TOKEN') && xVerify.includes('IQ\\s*WARS'), 'X post verification route requires configured bearer access and IQ WARS scorecard text.');

  assert(app.includes('geo: geoSnapshot || fallbackGeoSnapshot()'), 'Client submits inferred/fallback geography with official results.');
  assert(app.includes('buildGlobeRegions(geography') && app.includes('geography.countries'), 'Home/rankings globe derives regions from geography board data.');
  assert(i18n.includes('Official scores use edge geography when available and timezone as a fallback; empty boards stay empty until ranked attempts land.'), 'Updated real-data geography empty state is localized.');

  assert(geo.includes('x-vercel-ip-country') && geo.includes('queryTimeZone') && geo.includes('countryFromLocale'), 'Geo API combines edge headers, timezone, and browser locale fallbacks.');

  assert(store.includes('UPSTASH_REDIS_REST_URL') && store.includes('KV_REST_API_URL') && store.includes('REDIS_URL'), 'Store supports Redis/Upstash/Vercel KV configuration.');
  assert(store.includes('incomplete_redis_rest_config') && store.includes('invalid_redis_url') && store.includes("'misconfigured'"), 'Store health reports partial or invalid Redis/KV envs as misconfigured instead of silently falling back.');
  assert(store.includes("path.join('/tmp'"), 'Store has only an ephemeral /tmp fallback when Redis is not configured.');
  assert(store.includes('if (!config) return undefined') && store.includes('if (rest !== undefined) return rest'), 'Redis REST command routing preserves nil command results.');
  assert(store.includes('verifyPersistentStore') && store.includes("'SET', key, nonce, 'EX', '120'") && store.includes("['GET', key]"), 'Persistent store health verifies Redis/KV with a write/read round trip.');
  assert(store.includes('updateJsonStore') && store.includes('withLocalLock') && store.includes("'SET', key, token, 'NX', 'PX', '5000'") && store.includes('releaseRedisLock'), 'Shared store serializes read-modify-write updates locally and with Redis locks.');
  assert(health.includes('launchReady') && health.includes('verified') && health.includes('status = storage.persistent && !storage.verified ? 503 : 200'), 'Health API exposes launch readiness and fails broken persistent storage configs.');
  assert([leaderboard, attempts, username, profiles, roomMessages, presence].every((route) => route.includes('updateJsonStore')), 'Mutable app APIs use serialized JSON store updates.');
  assert(reminders.includes('updateReminderStore') && remindersSend.includes('updateReminderStore'), 'Reminder signup and send flows use serialized reminder store updates.');
  assert(audit.includes('persistent && verified && launchReady') && audit.includes('Promise.all') && audit.includes('race-safe'), 'Launch audit includes persistent-only concurrent write race checks.');
  assert(audit.includes("['/privacy'") && audit.includes("['/terms'") && audit.includes("['/blog/best-online-iq-test'") && audit.includes('assertLivePage'), 'Live audit covers the public page route surface.');

  if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL && !process.env.REDIS_URL) {
    const message = 'No Redis/KV env is visible in this shell; production must configure one or leaderboard/map/profile writes are only ephemeral per runtime.';
    if (requirePersistent) failures.push(message);
    else warn(message);
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

async function requestText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function assertLivePage(route, expectedSnippets, message) {
  const page = await requestText(`${origin}${route}`);
  assert(page.response.ok && expectedSnippets.every((snippet) => page.text.includes(snippet)), message);
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
  const playerCookieHeaders = { Cookie: 'iqwars_player_api_key=audit-player-key' };

  const before = await requestJson(`${origin}/api/leaderboards?day=${day}&group=${group}&agents=false`);
  assert(before.response.ok, 'Live leaderboard GET accepts agents=false.');
  const beforeRows = [...(before.data.global || []), ...(before.data.group || [])];
  assert(!beforeRows.some((row) => String(row.playerId || '').startsWith('agent-')), 'Live agents=false response contains no seeded agents before submit.');
  const farFutureBoard = await requestJson(`${origin}/api/leaderboards?day=${invalidFutureDay}&agents=false`);
  assert(farFutureBoard.response.status === 400, 'Live leaderboard API rejects arbitrary future board days.');

  const health = await requestJson(`${origin}/api/health`);
  assert(health.response.ok && health.data.ok === true, 'Live health endpoint responds when storage is not misconfigured.');
  const persistent = Boolean(health.data.storage?.persistent);
  const verified = Boolean(health.data.storage?.verified);
  const launchReady = Boolean(health.data.storage?.launchReady);
  const provider = String(health.data.storage?.provider || 'unknown');
  if (persistent && verified && launchReady) {
    pass(`Live storage is persistent and round-trip verified (${provider}).`);
  } else if (requirePersistent) {
    failures.push(`Live storage is not launch-persistent and verified (${provider}); configure Redis/KV envs before launch.`);
  } else {
    warn(`Live storage is not launch-persistent and verified (${provider}); configure Redis/KV envs before launch.`);
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
  assert(roomPost.response.ok && roomPost.data.message?.body === roomBody, 'Live room message API accepts a sanitized room message.');
  const roomGet = await requestJson(`${origin}/api/rooms/messages?group=${group}`);
  assert(roomGet.response.ok && (roomGet.data.messages || []).some((message) => message.body === roomBody), 'Live room message API reads messages for the requested room.');

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
  assert(globalRows.some((row) => row.playerId === playerId), 'Live global board includes the submitted real player.');
  assert(groupRows.some((row) => row.playerId === playerId && row.groupCode === group), 'Live friend room board includes only the submitted room player.');
  assert(!allRows.some((row) => String(row.playerId || '').startsWith('agent-')), 'Live agents=false response still excludes seeded agents after submit.');
  assert((after.data.geography?.countries || []).some((row) => row.label === 'United States' || row.id === 'US'), 'Live geography countries include submitted geo.');
  assert((after.data.geography?.cities || []).some((row) => row.label === 'New York'), 'Live geography cities include submitted geo.');
  assert((after.data.geography?.towns || []).some((row) => row.label === 'New York'), 'Live geography towns include submitted geo.');

  const geoCheck = await requestJson(`${origin}/api/geo?tz=America%2FNew_York&locale=en-US`);
  assert(geoCheck.response.ok && geoCheck.data.countryCode === 'US', 'Live geo endpoint infers country from browser locale fallback.');
  assert(geoCheck.response.ok && Boolean(geoCheck.data.city || geoCheck.data.town), 'Live geo endpoint returns usable city/town signal from edge or timezone data.');

  const groupPage = await requestText(`${origin}/g/${group}`);
  assert(groupPage.response.ok && groupPage.text.includes('Audit'), 'Live /g/[group] route renders the unique group name.');
  assert(groupPage.text.includes('menu-mark') && groupPage.text.includes('command-toggle') && !groupPage.text.includes('class="jsx-56ed461b0709d1ed command-id"'), 'Live nav renders as an icon sidebar launcher, not a cramped identity dropdown.');
  assert(groupPage.text.includes('Only people who open this link'), 'Live friend room copy promises link-only real-player membership.');

  const rankings = await requestText(`${origin}/rankings?g=${group}`);
  assert(rankings.response.ok && rankings.text.includes('Audit') && rankings.text.includes('friend rankings'), 'Live rankings route opens the requested friend board.');

  const publicPages = [
    ['/', ['Lock answer'], 'Live home route renders the playable test above the fold.'],
    ['/rankings', ['Live world board', 'Global board'], 'Live rankings route renders the global leaderboard view.'],
    ['/about', ['A daily global intelligence ranking', 'Country rankings'], 'Live about route renders the academic/geography positioning.'],
    ['/research', ['Daily abstract reasoning practice', 'Read source'], 'Live research route renders research sources.'],
    ['/agents', ['Connect account to use agent tools.', 'Public visitors should start with the daily test'], 'Live agents route is gated for logged-out visitors.'],
    ['/blog', ['Viral IQ research', 'Search-optimized explainers'], 'Live blog route renders article index content.'],
    ['/blog/best-online-iq-test', ['Best Online IQ Test', 'Why IQ WARS is different'], 'Live blog article route renders a routed article.'],
    ['/privacy', ['IQ WARS Privacy Policy', 'Recursiv Labs'], 'Live privacy route renders operator and policy text.'],
    ['/terms', ['IQ WARS Terms of Service', 'Fair play'], 'Live terms route renders fair-play terms.'],
    ['/profile', ['Connect account to manage your profile.'], 'Live logged-out profile route renders the account gate.'],
    ['/settings', ['Connect account to manage settings.'], 'Live logged-out settings route renders the account gate.'],
    ['/u/agent_euclid', ['IQ WARS'], 'Live public profile route renders the shell for a profile slug.'],
  ];
  for (const [route, snippets, message] of publicPages) {
    await assertLivePage(route, snippets, message);
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
