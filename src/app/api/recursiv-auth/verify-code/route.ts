import { NextRequest, NextResponse } from 'next/server';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const IQWARS_PROJECT_ID = process.env.IQWARS_RECURSIV_PROJECT_ID || process.env.RECURSIV_PROJECT_ID || '';
const RECURSIV_API_KEY = process.env.IQWARS_RECURSIV_API_KEY || process.env.RECURSIV_API_KEY || '';
const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 180) : '';
}

function cleanCode(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D+/g, '').slice(0, 12) : '';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown } | null;
  const email = cleanEmail(body?.email);
  const otp = cleanCode(body?.code);

  if (!email.includes('@') || otp.length < 4) {
    return NextResponse.json({ error: 'Enter the email and code.' }, { status: 400 });
  }

  if (!RECURSIV_API_KEY) {
    return NextResponse.json({ error: 'IQ WARS auth is not configured yet.' }, { status: 503 });
  }

  const response = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/auth/sign-in/email-otp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RECURSIV_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, otp }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { message?: string }, message?: string } | null;
    return NextResponse.json({ error: data?.error?.message || data?.message || 'Code could not be verified.' }, { status: response.status });
  }

  const data = await response.json().catch(() => null) as {
    token?: string;
    session?: { token?: string };
    user?: { id?: string; name?: string | null; email?: string };
  } | null;
  const sessionToken = data?.session?.token || data?.token || '';
  let projectMember = false;
  let keyPrefix: string | null = null;
  let playerApiKey: string | null = null;

  if (IQWARS_PROJECT_ID && sessionToken) {
    const keyResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/api-keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Cookie: `better-auth.session_token=${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'IQ WARS player',
        scopes: ['users:read', 'billing:read', 'billing:write'],
        projectId: IQWARS_PROJECT_ID,
      }),
    });

    if (!keyResponse.ok) {
      const keyData = await keyResponse.json().catch(() => null) as { error?: { message?: string }, message?: string } | null;
      return NextResponse.json({ error: keyData?.error?.message || keyData?.message || 'Could not connect this account to IQ WARS.' }, { status: keyResponse.status });
    }

    const keyData = await keyResponse.json().catch(() => null) as { data?: { key?: string; prefix?: string | null } } | null;
    projectMember = true;
    playerApiKey = typeof keyData?.data?.key === 'string' ? keyData.data.key : null;
    keyPrefix = keyData?.data?.prefix ?? null;
  }

  const result = NextResponse.json({
    verified: true,
    projectMember,
    keyPrefix,
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
