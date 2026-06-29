import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '../../_lib/rateLimit';
import { updateJsonStore } from '../../_lib/store';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const IQWARS_PROJECT_ID = process.env.IQWARS_RECURSIV_PROJECT_ID || process.env.RECURSIV_PROJECT_ID || '';
const IQWARS_PROJECT_API_KEY = process.env.IQWARS_RECURSIV_API_KEY || process.env.RECURSIV_PROJECT_API_KEY || process.env.RECURSIV_API_KEY || '';
const IQWARS_APP_ORIGIN = (process.env.IQWARS_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'https://iqwars.app').replace(/\/$/, '');
const IQWARS_APP_HOST = (() => {
  try {
    return new URL(IQWARS_APP_ORIGIN).host;
  } catch {
    return 'iqwars.app';
  }
})();
const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';
const ACCOUNT_LINKS_STORE_KEY = 'world-iq:account-links:v1';
const ACCOUNT_LINKS_STORE_FILE = 'world-iq-account-links.json';
const MAX_ACCOUNT_LINKS = 100_000;

type AccountLink = {
  accountId: string;
  playerId: string;
  keyPrefix: string | null;
  updatedAt: number;
};

type AccountLinksStore = {
  links: AccountLink[];
};

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 180) : '';
}

function cleanCode(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D+/g, '').slice(0, 12) : '';
}

function cleanPlayerId(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, '').slice(0, 100);
}

function cleanAccountId(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9:_@.-]+/g, '').slice(0, 180);
}

function fallbackAccountPlayerId(accountId: string) {
  const cleaned = cleanPlayerId(accountId.replace(/[@.]+/g, '-'));
  return cleaned ? `recursiv:${cleaned}`.slice(0, 100) : '';
}

function emptyAccountLinksStore(): AccountLinksStore {
  return { links: [] };
}

function isAccountLink(value: unknown): value is AccountLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Partial<AccountLink>;
  return typeof link.accountId === 'string'
    && typeof link.playerId === 'string'
    && typeof link.updatedAt === 'number';
}

function normalizeAccountLinksStore(parsed: Partial<AccountLinksStore>): AccountLinksStore {
  return {
    links: Array.isArray(parsed.links) ? parsed.links.filter(isAccountLink).slice(-MAX_ACCOUNT_LINKS) : [],
  };
}

async function resolveLinkedPlayerId(accountId: string, requestedPlayerId: string, keyPrefix: string | null) {
  const cleanedAccountId = cleanAccountId(accountId);
  if (!cleanedAccountId) return requestedPlayerId;

  return await updateJsonStore<Partial<AccountLinksStore>, string>(
    ACCOUNT_LINKS_STORE_KEY,
    emptyAccountLinksStore(),
    ACCOUNT_LINKS_STORE_FILE,
    (parsed) => {
      const store = normalizeAccountLinksStore(parsed);
      const existing = store.links.find((link) => link.accountId === cleanedAccountId);
      const now = Date.now();
      if (existing?.playerId) {
        existing.keyPrefix = keyPrefix;
        existing.updatedAt = now;
        return { value: store, result: existing.playerId };
      }

      const playerId = cleanPlayerId(requestedPlayerId) || fallbackAccountPlayerId(cleanedAccountId);
      if (playerId) {
        store.links.push({
          accountId: cleanedAccountId,
          playerId,
          keyPrefix,
          updatedAt: now,
        });
      }
      store.links = store.links.slice(-MAX_ACCOUNT_LINKS);
      return { value: store, result: playerId };
    },
  );
}

function extractSessionToken(response: Response, data: unknown) {
  const body = data as { token?: unknown; session?: { token?: unknown } } | null;
  if (typeof body?.session?.token === 'string') return body.session.token;
  if (typeof body?.token === 'string') return body.token;

  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1] || '';
}

function authError(data: unknown, fallback: string) {
  const body = data as { error?: { message?: string } | string; message?: string } | null;
  return typeof body?.error === 'string'
    ? body.error
    : body?.error?.message || body?.message || fallback;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown; playerId?: unknown } | null;
  const email = cleanEmail(body?.email);
  const otp = cleanCode(body?.code);
  const requestedPlayerId = cleanPlayerId(body?.playerId);

  if (!email.includes('@') || otp.length < 4) {
    return NextResponse.json({ error: 'Enter the email and code.' }, { status: 400 });
  }
  const limited = await enforceRateLimit(request, {
    bucket: 'auth:verify-code',
    identity: `email:${email}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  if (!IQWARS_PROJECT_ID || !IQWARS_PROJECT_API_KEY) {
    return NextResponse.json({ error: 'IQ WARS auth is not configured yet.' }, { status: 503 });
  }

  const response = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/auth/sign-in/email-otp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IQWARS_PROJECT_API_KEY}`,
      'Content-Type': 'application/json',
      Host: IQWARS_APP_HOST,
      Origin: IQWARS_APP_ORIGIN,
    },
    body: JSON.stringify({ email, otp }),
  });

  const data = await response.json().catch(() => null) as {
    token?: string;
    session?: { token?: string };
    user?: { id?: string; name?: string | null; email?: string };
  } | null;

  if (!response.ok) {
    return NextResponse.json({ error: authError(data, 'Code could not be verified.') }, { status: response.status });
  }

  const sessionToken = extractSessionToken(response, data);
  if (!sessionToken) {
    return NextResponse.json({ error: 'No session returned from Recursiv auth.' }, { status: 502 });
  }

  let projectMember = false;
  let keyPrefix: string | null = null;
  let playerApiKey: string | null = null;

  const keyResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/api-keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `better-auth.session_token=${sessionToken}`,
      'Content-Type': 'application/json',
      Origin: RECURSIV_AUTH_ORIGIN,
    },
    body: JSON.stringify({
      name: 'IQ WARS player',
      scopes: ['users:read', 'projects:read', 'billing:read', 'billing:write'],
      projectId: IQWARS_PROJECT_ID,
    }),
  });

  const keyData = await keyResponse.json().catch(() => null) as {
    data?: { key?: string; prefix?: string | null };
    error?: { message?: string } | string;
    message?: string;
  } | null;

  if (!keyResponse.ok) {
    return NextResponse.json({ error: authError(keyData, 'Could not connect this account to IQ WARS.') }, { status: keyResponse.status });
  }

  projectMember = true;
  playerApiKey = typeof keyData?.data?.key === 'string' ? keyData.data.key : null;
  keyPrefix = keyData?.data?.prefix ?? null;

  if (!playerApiKey) {
    return NextResponse.json({ error: 'Recursiv did not return an IQ WARS player key.' }, { status: 502 });
  }

  const accountId = cleanAccountId(data?.user?.id) || `email:${email}`;
  const linkedPlayerId = await resolveLinkedPlayerId(accountId, requestedPlayerId, keyPrefix);

  const result = NextResponse.json({
    verified: true,
    projectMember,
    keyPrefix,
    playerId: linkedPlayerId || requestedPlayerId,
    user: data?.user ? {
      id: data.user.id,
      name: data.user.name ?? null,
      email: data.user.email ?? email,
    } : { email },
  });

  if (playerApiKey) {
    result.cookies.set({
      name: PLAYER_API_KEY_COOKIE,
      value: playerApiKey,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 90,
      path: '/',
    });
  }

  return result;
}
