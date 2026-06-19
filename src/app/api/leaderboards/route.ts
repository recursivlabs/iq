import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, writeJsonStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SocialEntry = {
  id: string;
  day: string;
  playerId: string;
  displayName: string;
  username: string | null;
  groupCode: string | null;
  groupName: string | null;
  score: number;
  rank: string;
  percentile: number;
  correct: number;
  total: number;
  beatAi: number;
  elapsedMs: number | null;
  speedBonus: number | null;
  timestamp: number;
};

type LeaderboardStore = {
  entries: SocialEntry[];
};

const STORE_KEY = 'world-iq:leaderboards:v2';
const STORE_FILE = 'world-iq-leaderboards.json';
const MAX_ENTRIES = 5000;
const MAX_BOARD_ROWS = 50;

function emptyStore(): LeaderboardStore {
  return { entries: [] };
}

function sanitizeGroupCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function sanitizeUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 20);
}

function sanitizeText(value: unknown, fallback: string, max = 40) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function isSocialEntry(value: unknown): value is SocialEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SocialEntry>;
  return typeof entry.day === 'string'
    && typeof entry.playerId === 'string'
    && typeof entry.displayName === 'string'
    && typeof entry.score === 'number'
    && typeof entry.rank === 'string'
    && typeof entry.percentile === 'number'
    && typeof entry.correct === 'number'
    && typeof entry.total === 'number'
    && typeof entry.beatAi === 'number'
    && typeof entry.timestamp === 'number';
}

async function readStore(): Promise<LeaderboardStore> {
  const parsed = await readJsonStore<Partial<LeaderboardStore>>(STORE_KEY, emptyStore(), STORE_FILE);
  return {
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isSocialEntry).slice(-MAX_ENTRIES) : [],
  };
}

async function writeStore(store: LeaderboardStore) {
  store.entries = store.entries.slice(-MAX_ENTRIES);
  await writeJsonStore(STORE_KEY, store, STORE_FILE);
}

function boardRows(entries: SocialEntry[]) {
  return [...entries]
    .sort((a, b) => b.score - a.score || b.beatAi - a.beatAi || (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER) || a.timestamp - b.timestamp)
    .slice(0, MAX_BOARD_ROWS);
}

function globalRows(entries: SocialEntry[], day: string) {
  const bestByPlayer = new Map<string, SocialEntry>();
  for (const entry of entries) {
    if (entry.day !== day) continue;
    const existing = bestByPlayer.get(entry.playerId);
    if (!existing || entry.score > existing.score || (entry.score === existing.score && entry.timestamp < existing.timestamp)) {
      bestByPlayer.set(entry.playerId, entry);
    }
  }
  return boardRows([...bestByPlayer.values()]);
}

function groupRows(entries: SocialEntry[], day: string, groupCode: string) {
  return boardRows(entries.filter((entry) => entry.day === day && entry.groupCode === groupCode));
}

export async function GET(request: NextRequest) {
  const day = sanitizeText(request.nextUrl.searchParams.get('day'), new Date().toISOString().slice(0, 10), 10);
  const groupCode = sanitizeGroupCode(request.nextUrl.searchParams.get('group'));
  const store = await readStore();

  return NextResponse.json({
    day,
    global: globalRows(store.entries, day),
    group: groupCode ? groupRows(store.entries, day, groupCode) : [],
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid leaderboard entry.' }, { status: 400 });
  }

  const day = sanitizeText(body.day, new Date().toISOString().slice(0, 10), 10);
  const playerId = sanitizeText(body.playerId, '', 80);
  if (!playerId) {
    return NextResponse.json({ error: 'Missing player.' }, { status: 400 });
  }

  const score = Number(body.score);
  const correct = Number(body.correct);
  const total = Number(body.total);
  const percentile = Number(body.percentile);
  const beatAi = Number(body.beatAi);
  const elapsedMs = Number(body.elapsedMs);
  const speedBonus = Number(body.speedBonus);
  if (![score, correct, total, percentile, beatAi].every(Number.isFinite)) {
    return NextResponse.json({ error: 'Invalid score.' }, { status: 400 });
  }

  const groupCode = sanitizeGroupCode(body.groupCode) || null;
  const groupName = groupCode ? sanitizeText(body.groupName, groupCode.toUpperCase(), 48) : null;
  const entry: SocialEntry = {
    id: `${day}:${playerId}:${groupCode || 'global'}`,
    day,
    playerId,
    displayName: sanitizeText(body.displayName, 'Anonymous', 32),
    username: sanitizeUsername(body.username) || null,
    groupCode,
    groupName,
    score: Math.max(0, Math.min(200, Math.round(score))),
    rank: sanitizeText(body.rank, '#--', 20),
    percentile: Math.max(0, Math.min(100, percentile)),
    correct: Math.max(0, Math.min(99, Math.round(correct))),
    total: Math.max(1, Math.min(99, Math.round(total))),
    beatAi: Math.max(0, Math.min(99, Math.round(beatAi))),
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.min(86_400_000, Math.round(elapsedMs))) : null,
    speedBonus: Number.isFinite(speedBonus) ? Math.max(0, Math.min(50, Math.round(speedBonus))) : null,
    timestamp: Date.now(),
  };

  const store = await readStore();
  const existingIndex = store.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    entry.timestamp = store.entries[existingIndex].timestamp;
    store.entries[existingIndex] = { ...store.entries[existingIndex], displayName: entry.displayName, username: entry.username, groupName: entry.groupName };
  } else {
    store.entries.push(entry);
  }
  await writeStore(store);

  return NextResponse.json({
    accepted: existingIndex < 0,
    entry: existingIndex >= 0 ? store.entries[existingIndex] : entry,
    global: globalRows(store.entries, day),
    group: groupCode ? groupRows(store.entries, day, groupCode) : [],
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
