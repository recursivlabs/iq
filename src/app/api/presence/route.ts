import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, writeJsonStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PresenceSession = {
  id: string;
  playerId: string;
  username: string | null;
  path: string;
  lastSeen: number;
};

type PresenceStore = {
  sessions: PresenceSession[];
};

const STORE_KEY = 'world-iq:presence:v1';
const STORE_FILE = 'world-iq-presence.json';
const ACTIVE_WINDOW_MS = 45_000;
const RETAIN_WINDOW_MS = 180_000;
const MAX_SESSIONS = 10_000;

function emptyStore(): PresenceStore {
  return { sessions: [] };
}

function sanitizeId(value: unknown, max = 96) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, '').slice(0, max);
}

function sanitizeUsername(value: unknown) {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]+/g, '').slice(0, 20).toLowerCase();
  return username || null;
}

function sanitizePath(value: unknown) {
  if (typeof value !== 'string') return '/';
  const path = value.trim().replace(/[?#].*$/, '').slice(0, 120);
  return path.startsWith('/') ? path : '/';
}

function isSession(value: unknown): value is PresenceSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<PresenceSession>;
  return typeof session.id === 'string'
    && typeof session.playerId === 'string'
    && typeof session.path === 'string'
    && typeof session.lastSeen === 'number';
}

async function readStore(): Promise<PresenceStore> {
  const parsed = await readJsonStore<Partial<PresenceStore>>(STORE_KEY, emptyStore(), STORE_FILE);
  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions.filter(isSession).slice(-MAX_SESSIONS) : [],
  };
}

async function writeStore(store: PresenceStore) {
  store.sessions = store.sessions.slice(-MAX_SESSIONS);
  await writeJsonStore(STORE_KEY, store, STORE_FILE);
}

function pruneSessions(sessions: PresenceSession[], now: number) {
  return sessions.filter((session) => now - session.lastSeen <= RETAIN_WINDOW_MS).slice(-MAX_SESSIONS);
}

function activeCount(sessions: PresenceSession[], now: number) {
  return sessions.filter((session) => now - session.lastSeen <= ACTIVE_WINDOW_MS).length;
}

function responseFor(store: PresenceStore, now: number) {
  return NextResponse.json({
    active: Math.max(1, activeCount(store.sessions, now)),
    updatedAt: now,
    source: 'heartbeat',
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function GET() {
  const now = Date.now();
  const store = await readStore();
  store.sessions = pruneSessions(store.sessions, now);
  await writeStore(store);
  return responseFor(store, now);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = sanitizeId(body?.sessionId);
  const playerId = sanitizeId(body?.playerId);
  if (!sessionId || !playerId) {
    return NextResponse.json({ error: 'Missing session.' }, { status: 400 });
  }

  const now = Date.now();
  const store = await readStore();
  const session: PresenceSession = {
    id: sessionId,
    playerId,
    username: sanitizeUsername(body?.username),
    path: sanitizePath(body?.path),
    lastSeen: now,
  };
  const sessions = pruneSessions(store.sessions, now).filter((existing) => existing.id !== sessionId);
  sessions.push(session);
  store.sessions = sessions;
  await writeStore(store);
  return responseFor(store, now);
}
