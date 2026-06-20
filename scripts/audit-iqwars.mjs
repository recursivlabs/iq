#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src/app/IqApp.tsx');
const leaderboardPath = path.join(root, 'src/app/api/leaderboards/route.ts');
const attemptsPath = path.join(root, 'src/app/api/attempts/route.ts');
const geoPath = path.join(root, 'src/app/api/geo/route.ts');
const storePath = path.join(root, 'src/app/api/_lib/store.ts');
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
const groupPagePath = path.join(root, 'src/app/g/[group]/page.tsx');
const rankingsPagePath = path.join(root, 'src/app/rankings/page.tsx');

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

async function sourceAudit() {
  const app = source(appPath);
  const leaderboard = source(leaderboardPath);
  const attempts = source(attemptsPath);
  const store = source(storePath);
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
  const groupPage = source(groupPagePath);
  const rankingsPage = source(rankingsPagePath);
  const { ts, tree } = await parseTs(appPath, (await import('typescript')).ScriptKind.TSX);

  assert(existsSync(appPath), 'IqApp source exists.');
  assert(existsSync(leaderboardPath), 'Leaderboard API route exists.');
  assert(existsSync(attemptsPath), 'Server attempt lock API route exists.');
  assert(existsSync(geoPath), 'Geo API route exists.');
  assert(existsSync(storePath), 'Shared JSON/Redis store exists.');
  assert(existsSync(path.join(root, 'src/app/api/health/route.ts')), 'Storage health API route exists.');
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

  const dailyLimit = initializerText(findVariable(ts, tree, 'DAILY_PLAY_LIMIT'), app);
  assert(dailyLimit === '1', 'Free official play is limited to one completed run per day.');

  const rankedIds = stringArrayFromVariable(ts, tree, 'rankedWorldPuzzleIds');
  assert(rankedIds.length >= 12, 'Official world mode has at least 12 configured puzzle ids.');
  assert(new Set(rankedIds).size === rankedIds.length, 'Official world puzzle id list has no duplicates.');

  const proofChecks = functionText(findFunction(ts, tree, 'withProofChecks'), app);
  assert(proofChecks.includes('solutionProof.checksum') && proofChecks.includes('proofTileSignature'), 'Puzzle answer proofs are checksum-verified at module load.');

  const getQuestions = functionText(findFunction(ts, tree, 'getQuestions'), app);
  assert(getQuestions.includes('stableQuestionOrder(mode, rankedWorldPuzzles') && getQuestions.includes('rankedWorldPuzzles.slice(0, 4)'), 'Official question order is stable per day and starts from the calibrated starter pool.');
  assert(getQuestions.includes('stableQuestionOrder(mode, agiPuzzles'), 'AGI lab questions use the same stable rotation helper.');

  const chooseStarter = functionText(findFunction(ts, tree, 'chooseStarterId'), app);
  assert(chooseStarter.includes('readQuestionStarterHistory') && chooseStarter.includes('writeQuestionStarterHistory') && chooseStarter.includes('available.length > 0 ? available : candidateIds'), 'Question starters cycle through recent-start history before repeating.');

  const stableOrder = functionText(findFunction(ts, tree, 'stableQuestionOrder'), app);
  assert(stableOrder.includes('readQuestionOrder') && stableOrder.includes('writeQuestionOrder'), 'Daily question order is persisted so refreshes do not reshuffle an active attempt.');
  assert(app.includes('function permutedQuestionOrder') && stableOrder.includes('permutedQuestionOrder'), 'Question order is fully permuted per player/day after selecting the rotating starter.');

  const result = app.slice(app.indexOf('function Result('), app.indexOf('function Runner('));
  assert(result.includes('readOfficialRank()') && result.includes("setResultStatus('practice')"), 'Retakes after a locked daily result are marked practice.');
  assert(result.includes('claimServerOfficialAttempt') && result.includes('syncLocalOfficialLock(officialRank)'), 'First official completion claims the server attempt lock before local official sync.');
  assert(result.includes('consumePlay()'), 'First official completion consumes the daily attempt locally.');
  assert(result.includes('onLeaderboard(entry, officialRank)'), 'Official completion submits into the leaderboard flow.');

  const runner = app.slice(app.indexOf('function Runner('), app.indexOf('export default function Home'));
  assert(runner.includes('readServerOfficialAttempt') && runner.includes('onServerAttemptLocked'), 'Runner syncs server-side daily attempt locks.');

  const handleLeaderboard = app.slice(app.indexOf('function handleLeaderboard'), app.indexOf('const handleUsageChange'));
  assert(handleLeaderboard.includes("navigateView('rankings')"), 'Completing the official run routes the player to rankings.');

  assert(groupPage.includes('initialGroupCode={params.group}'), 'Friend group route injects the room code into the app.');
  assert(rankingsPage.includes('initialView="rankings"') && rankingsPage.includes("searchParams?.g"), 'Rankings route opens directly into a friend room board from ?g=.');

  assert(leaderboard.includes("request.nextUrl.searchParams.get('agents') !== 'false'"), 'Leaderboard API supports agents=false filtering.');
  assert(leaderboard.includes("!entry.playerId.startsWith('agent-')"), 'Friend group leaderboard excludes seeded agent players.');
  assert(leaderboard.includes('geo: sanitizeGeo(body.geo)'), 'Leaderboard submissions persist sanitized geography snapshots.');
  assert(leaderboard.includes('geography: geographyRows(responseEntries, day)') && leaderboard.includes('geographyRows(entries, day)'), 'Geography boards are computed from the same real leaderboard entry set.');
  assert(leaderboard.includes('const bestByPlaceAndPlayer = new Map'), 'Geography boards dedupe by place and player before averaging.');

  assert(attempts.includes("STORE_KEY = 'world-iq:official-attempts:v1'"), 'Attempt lock API stores official attempts under a dedicated key.');
  assert(attempts.includes('accepted: false') && attempts.includes('locked: true'), 'Attempt lock API returns an existing lock instead of accepting duplicates.');
  assert(attempts.includes('readJsonStore') && attempts.includes('writeJsonStore'), 'Attempt lock API uses the shared Redis-backed store.');

  assert(username.includes('isValidUsername') && username.includes('status: 409'), 'Username API validates format and rejects claims owned by another player.');
  assert(profiles.includes('publicProfile(profile)') && profiles.includes('profilePublic'), 'Profile API applies public/privacy controls before returning profiles.');
  assert(roomMessages.includes('MAX_ROOM_MESSAGES') && roomMessages.includes('sanitizeBody'), 'Room messages API limits and sanitizes room chat.');
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

  assert(geo.includes('x-vercel-ip-country') && geo.includes('queryTimeZone') && geo.includes('countryFromLocale'), 'Geo API combines edge headers, timezone, and browser locale fallbacks.');

  assert(store.includes('UPSTASH_REDIS_REST_URL') && store.includes('KV_REST_API_URL') && store.includes('REDIS_URL'), 'Store supports Redis/Upstash/Vercel KV configuration.');
  assert(store.includes("path.join('/tmp'"), 'Store has only an ephemeral /tmp fallback when Redis is not configured.');

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
  const roomBody = `audit message ${randomUUID().slice(0, 8)}`;
  const day = '2099-12-31';
  const geo = {
    country: 'United States',
    countryCode: 'US',
    region: 'New York',
    city: 'New York',
    town: 'New York',
    timeZone: 'America/New_York',
    source: 'audit',
  };

  const before = await requestJson(`${origin}/api/leaderboards?day=${day}&group=${group}&agents=false`);
  assert(before.response.ok, 'Live leaderboard GET accepts agents=false.');
  const beforeRows = [...(before.data.global || []), ...(before.data.group || [])];
  assert(!beforeRows.some((row) => String(row.playerId || '').startsWith('agent-')), 'Live agents=false response contains no seeded agents before submit.');

  const health = await requestJson(`${origin}/api/health`);
  assert(health.response.ok && health.data.ok === true, 'Live health endpoint responds.');
  const persistent = Boolean(health.data.storage?.persistent);
  const provider = String(health.data.storage?.provider || 'unknown');
  if (persistent) {
    pass(`Live storage is persistent (${provider}).`);
  } else if (requirePersistent) {
    failures.push(`Live storage is not launch-persistent (${provider}); configure Redis/KV envs before launch.`);
  } else {
    warn(`Live storage is not launch-persistent (${provider}); configure Redis/KV envs before launch.`);
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

  const profilePost = await requestJson(`${origin}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  const roomMissing = await requestJson(`${origin}/api/rooms/messages`);
  assert(roomMissing.response.status === 400, 'Live room message API rejects missing room reads.');
  const roomPost = await requestJson(`${origin}/api/rooms/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  const attempt = {
    day,
    playerId,
    score: 137,
    rank: '#13,700',
    percentile: 98.63,
    correct: 10,
    total: 12,
    beatAi: 3,
    elapsedMs: 390000,
    speedBonus: 2,
  };
  const attemptPost = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attempt),
  });
  assert(attemptPost.response.ok && attemptPost.data.accepted === true && attemptPost.data.locked === true, 'Live attempt API accepts the first official attempt lock.');

  const attemptDuplicate = await requestJson(`${origin}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...attempt, score: 99, correct: 1 }),
  });
  assert(attemptDuplicate.response.ok && attemptDuplicate.data.accepted === false && attemptDuplicate.data.attempt?.score === 137, 'Live attempt API rejects duplicate official attempts for the same player/day.');

  const attemptGet = await requestJson(`${origin}/api/attempts?day=${day}&playerId=${encodeURIComponent(playerId)}`);
  assert(attemptGet.response.ok && attemptGet.data.locked === true && attemptGet.data.attempt?.playerId === playerId, 'Live attempt API reads back the server-side daily lock.');

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
  assert(post.response.ok && post.data.accepted === true, 'Live leaderboard POST accepts a real future-dated audit entry.');

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
  assert(groupPage.text.includes('menu-mark') && !groupPage.text.includes('class="jsx-56ed461b0709d1ed command-id"'), 'Live nav renders as icon drawer launcher, not cramped identity dropdown.');

  const rankings = await requestText(`${origin}/rankings?g=${group}`);
  assert(rankings.response.ok && rankings.text.includes('Audit') && rankings.text.includes('friend rankings'), 'Live rankings route opens the requested friend board.');
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
