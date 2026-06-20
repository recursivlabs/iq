import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, updateJsonStore } from '../../_lib/store';
import { validatePlayerAccount } from '../../_lib/playerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RoomMessage = {
  id: string;
  groupCode: string;
  playerId: string;
  displayName: string;
  username: string | null;
  body: string;
  timestamp: number;
};

type RoomMessageStore = {
  messages: RoomMessage[];
};

const STORE_KEY = 'world-iq:room-messages:v1';
const STORE_FILE = 'world-iq-room-messages.json';
const MAX_MESSAGES = 3000;
const MAX_ROOM_MESSAGES = 80;

function emptyStore(): RoomMessageStore {
  return { messages: [] };
}

function sanitizeGroupCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function sanitizeUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 20);
}

function sanitizeText(value: unknown, fallback: string, max = 80) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function sanitizeBody(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<RoomMessage>;
  return typeof message.id === 'string'
    && typeof message.groupCode === 'string'
    && typeof message.playerId === 'string'
    && typeof message.displayName === 'string'
    && typeof message.body === 'string'
    && typeof message.timestamp === 'number';
}

function normalizeStore(parsed: Partial<RoomMessageStore>): RoomMessageStore {
  return {
    messages: Array.isArray(parsed.messages) ? parsed.messages.filter(isRoomMessage).slice(-MAX_MESSAGES) : [],
  };
}

async function readStore(): Promise<RoomMessageStore> {
  return normalizeStore(await readJsonStore<Partial<RoomMessageStore>>(STORE_KEY, emptyStore(), STORE_FILE));
}

function trimStore(store: RoomMessageStore) {
  store.messages = store.messages.slice(-MAX_MESSAGES);
  return store;
}

async function updateStore<R>(updater: (store: RoomMessageStore) => R) {
  return await updateJsonStore<Partial<RoomMessageStore>, R>(STORE_KEY, emptyStore(), STORE_FILE, (parsed) => {
    const store = normalizeStore(parsed);
    const result = updater(store);
    return { value: trimStore(store), result };
  });
}

function roomRows(messages: RoomMessage[], groupCode: string) {
  return messages
    .filter((message) => message.groupCode === groupCode)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_ROOM_MESSAGES);
}

export async function GET(request: NextRequest) {
  const groupCode = sanitizeGroupCode(request.nextUrl.searchParams.get('group'));
  if (!groupCode) {
    return NextResponse.json({ error: 'Missing room.' }, { status: 400 });
  }

  const store = await readStore();
  return NextResponse.json({ messages: roomRows(store.messages, groupCode) }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const account = await validatePlayerAccount(request);
  if (!account.ok) {
    const error = account.status === 401
      ? 'Connect an IQ WARS account before posting room chat.'
      : account.error;
    return NextResponse.json({ error }, { status: account.status });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid message.' }, { status: 400 });
  }

  const groupCode = sanitizeGroupCode(body.groupCode);
  const playerId = sanitizeText(body.playerId, '', 80);
  const messageBody = sanitizeBody(body.body);
  if (!groupCode || !playerId || !messageBody) {
    return NextResponse.json({ error: 'Missing room, player, or message.' }, { status: 400 });
  }

  const message: RoomMessage = {
    id: `${groupCode}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    groupCode,
    playerId,
    displayName: sanitizeText(body.displayName, 'Anonymous', 32),
    username: sanitizeUsername(body.username) || null,
    body: messageBody,
    timestamp: Date.now(),
  };

  const messages = await updateStore((store) => {
    store.messages.push(message);
    return roomRows(store.messages, groupCode);
  });

  return NextResponse.json({ message, messages }, {
    headers: { 'cache-control': 'no-store' },
  });
}
