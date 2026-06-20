import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, writeJsonStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type OfficialAttempt = {
  id: string;
  day: string;
  playerId: string;
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

type AttemptStore = {
  attempts: OfficialAttempt[];
};

const STORE_KEY = 'world-iq:official-attempts:v1';
const STORE_FILE = 'world-iq-official-attempts.json';
const MAX_ATTEMPTS = 50_000;

function emptyStore(): AttemptStore {
  return { attempts: [] };
}

function sanitizeText(value: unknown, fallback: string, max = 80) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function sanitizePlayerId(value: unknown) {
  return sanitizeText(value, '', 100).replace(/[^a-zA-Z0-9:_-]+/g, '').slice(0, 100);
}

function sanitizeDay(value: unknown) {
  const day = sanitizeText(value, new Date().toISOString().slice(0, 10), 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10);
}

function cleanNumber(value: unknown, min: number, max: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(min, Math.min(max, Math.round(next))) : null;
}

function isOfficialAttempt(value: unknown): value is OfficialAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<OfficialAttempt>;
  return typeof attempt.id === 'string'
    && typeof attempt.day === 'string'
    && typeof attempt.playerId === 'string'
    && typeof attempt.score === 'number'
    && typeof attempt.rank === 'string'
    && typeof attempt.percentile === 'number'
    && typeof attempt.correct === 'number'
    && typeof attempt.total === 'number'
    && typeof attempt.beatAi === 'number'
    && typeof attempt.timestamp === 'number';
}

async function readStore(): Promise<AttemptStore> {
  const parsed = await readJsonStore<Partial<AttemptStore>>(STORE_KEY, emptyStore(), STORE_FILE);
  return {
    attempts: Array.isArray(parsed.attempts) ? parsed.attempts.filter(isOfficialAttempt).slice(-MAX_ATTEMPTS) : [],
  };
}

async function writeStore(store: AttemptStore) {
  store.attempts = store.attempts.slice(-MAX_ATTEMPTS);
  await writeJsonStore(STORE_KEY, store, STORE_FILE);
}

function publicAttempt(attempt: OfficialAttempt) {
  return {
    day: attempt.day,
    playerId: attempt.playerId,
    score: attempt.score,
    rank: attempt.rank,
    percentile: attempt.percentile,
    correct: attempt.correct,
    total: attempt.total,
    beatAi: attempt.beatAi,
    elapsedMs: attempt.elapsedMs,
    speedBonus: attempt.speedBonus,
    timestamp: attempt.timestamp,
  };
}

export async function GET(request: NextRequest) {
  const day = sanitizeDay(request.nextUrl.searchParams.get('day'));
  const playerId = sanitizePlayerId(request.nextUrl.searchParams.get('playerId'));
  if (!playerId) {
    return NextResponse.json({ error: 'Missing player.' }, { status: 400 });
  }

  const store = await readStore();
  const attempt = store.attempts.find((item) => item.day === day && item.playerId === playerId);
  return NextResponse.json({
    day,
    playerId,
    locked: Boolean(attempt),
    attempt: attempt ? publicAttempt(attempt) : null,
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid attempt.' }, { status: 400 });
  }

  const day = sanitizeDay(body.day);
  const playerId = sanitizePlayerId(body.playerId);
  if (!playerId) {
    return NextResponse.json({ error: 'Missing player.' }, { status: 400 });
  }

  const score = cleanNumber(body.score, 0, 200);
  const correct = cleanNumber(body.correct, 0, 99);
  const total = cleanNumber(body.total, 1, 99);
  const percentile = Number(body.percentile);
  const beatAi = cleanNumber(body.beatAi, 0, 99);
  const elapsedMs = cleanNumber(body.elapsedMs, 0, 86_400_000);
  const speedBonus = cleanNumber(body.speedBonus, 0, 50);
  if (score === null || correct === null || total === null || !Number.isFinite(percentile) || beatAi === null) {
    return NextResponse.json({ error: 'Invalid score.' }, { status: 400 });
  }

  const store = await readStore();
  const id = `${day}:${playerId}`;
  const existing = store.attempts.find((item) => item.id === id);
  if (existing) {
    return NextResponse.json({
      accepted: false,
      locked: true,
      attempt: publicAttempt(existing),
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  }

  const attempt: OfficialAttempt = {
    id,
    day,
    playerId,
    score,
    rank: sanitizeText(body.rank, '#--', 24),
    percentile: Math.max(0, Math.min(100, percentile)),
    correct,
    total,
    beatAi,
    elapsedMs,
    speedBonus,
    timestamp: Date.now(),
  };

  store.attempts.push(attempt);
  await writeStore(store);

  return NextResponse.json({
    accepted: true,
    locked: true,
    attempt: publicAttempt(attempt),
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
