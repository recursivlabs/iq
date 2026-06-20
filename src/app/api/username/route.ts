import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, updateJsonStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UsernameClaim = {
  username: string;
  playerId: string;
  displayName: string;
  claimedAt: number;
};

type UsernameStore = {
  claims: Record<string, UsernameClaim>;
};

const STORE_KEY = 'world-iq:usernames:v1';
const STORE_FILE = 'world-iq-usernames.json';

function cleanUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 20);
}

function cleanPlayerId(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 80);
}

function cleanDisplayName(value: unknown, username: string) {
  if (typeof value !== 'string') return `@${username}`;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, 32);
  return text || `@${username}`;
}

function isValidUsername(username: string) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

function normalizeStore(parsed: Partial<UsernameStore>): UsernameStore {
  return { claims: parsed.claims && typeof parsed.claims === 'object' ? parsed.claims : {} };
}

async function readStore(): Promise<UsernameStore> {
  return normalizeStore(await readJsonStore<Partial<UsernameStore>>(STORE_KEY, { claims: {} }, STORE_FILE));
}

async function updateStore<R>(updater: (store: UsernameStore) => R) {
  return await updateJsonStore<Partial<UsernameStore>, R>(STORE_KEY, { claims: {} }, STORE_FILE, (parsed) => {
    const store = normalizeStore(parsed);
    const result = updater(store);
    return { value: store, result };
  });
}

export async function GET(request: NextRequest) {
  const username = cleanUsername(request.nextUrl.searchParams.get('username'));
  if (!isValidUsername(username)) {
    return NextResponse.json({ available: false, error: 'Use 3-20 letters, numbers, or underscores.' }, { status: 400 });
  }

  const store = await readStore();
  return NextResponse.json({
    username,
    available: !store.claims[username],
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = cleanUsername(body?.username);
  const playerId = cleanPlayerId(body?.playerId);
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'Use 3-20 letters, numbers, or underscores.' }, { status: 400 });
  }
  if (!playerId) {
    return NextResponse.json({ error: 'Missing player.' }, { status: 400 });
  }

  const result = await updateStore((store) => {
    const existing = store.claims[username];
    if (existing && existing.playerId !== playerId) {
      return { status: 409, body: { error: `@${username} is taken.` } };
    }

    const claim: UsernameClaim = {
      username,
      playerId,
      displayName: cleanDisplayName(body?.displayName, username),
      claimedAt: existing?.claimedAt || Date.now(),
    };
    store.claims[username] = claim;
    return { status: 200, body: { ok: true, claim } };
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
}
