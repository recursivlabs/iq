#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src/app/IqApp.tsx');
const leaderboardPath = path.join(root, 'src/app/api/leaderboards/route.ts');
const geoPath = path.join(root, 'src/app/api/geo/route.ts');
const storePath = path.join(root, 'src/app/api/_lib/store.ts');
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
  const store = source(storePath);
  const geo = source(geoPath);
  const groupPage = source(groupPagePath);
  const rankingsPage = source(rankingsPagePath);
  const { ts, tree } = await parseTs(appPath, (await import('typescript')).ScriptKind.TSX);

  assert(existsSync(appPath), 'IqApp source exists.');
  assert(existsSync(leaderboardPath), 'Leaderboard API route exists.');
  assert(existsSync(geoPath), 'Geo API route exists.');
  assert(existsSync(storePath), 'Shared JSON/Redis store exists.');
  assert(existsSync(path.join(root, 'src/app/api/health/route.ts')), 'Storage health API route exists.');

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

  const result = app.slice(app.indexOf('function Result('), app.indexOf('function Runner('));
  assert(result.includes('readOfficialRank()') && result.includes("setResultStatus('practice')"), 'Retakes after a locked daily result are marked practice.');
  assert(result.includes('writeOfficialRank(officialRank)') && result.includes('consumePlay()'), 'First official completion writes the local official rank and consumes the daily attempt.');
  assert(result.includes('onLeaderboard(entry, officialRank)'), 'Official completion submits into the leaderboard flow.');

  const handleLeaderboard = app.slice(app.indexOf('function handleLeaderboard'), app.indexOf('const handleUsageChange'));
  assert(handleLeaderboard.includes("navigateView('rankings')"), 'Completing the official run routes the player to rankings.');

  assert(groupPage.includes('initialGroupCode={params.group}'), 'Friend group route injects the room code into the app.');
  assert(rankingsPage.includes('initialView="rankings"') && rankingsPage.includes("searchParams?.g"), 'Rankings route opens directly into a friend room board from ?g=.');

  assert(leaderboard.includes("request.nextUrl.searchParams.get('agents') !== 'false'"), 'Leaderboard API supports agents=false filtering.');
  assert(leaderboard.includes("!entry.playerId.startsWith('agent-')"), 'Friend group leaderboard excludes seeded agent players.');
  assert(leaderboard.includes('geo: sanitizeGeo(body.geo)'), 'Leaderboard submissions persist sanitized geography snapshots.');
  assert(leaderboard.includes('geography: geographyRows(responseEntries, day)') && leaderboard.includes('geographyRows(entries, day)'), 'Geography boards are computed from the same real leaderboard entry set.');
  assert(leaderboard.includes('const bestByPlaceAndPlayer = new Map'), 'Geography boards dedupe by place and player before averaging.');

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

async function liveAudit() {
  const group = `audit-${randomUUID().slice(0, 8)}`;
  const playerId = `audit-player-${randomUUID()}`;
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
