import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const ACCESS_COOKIE = 'world_iq_paid';
const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function setAccessCookie(response: NextResponse, active: boolean) {
  if (active) {
    response.cookies.set({
      name: ACCESS_COOKIE,
      value: 'active',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 35,
      path: '/',
    });
    return;
  }

  response.cookies.set({
    name: ACCESS_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
}

export async function GET(request: NextRequest) {
  const playerApiKey = request.cookies.get(PLAYER_API_KEY_COOKIE)?.value || '';
  if (!playerApiKey) {
    return jsonError('Create an IQ WARS account before checkout.', 401);
  }

  const recursivResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/app-subscriptions/status`, {
    headers: {
      Authorization: `Bearer ${playerApiKey}`,
    },
    cache: 'no-store',
  });

  const data = await recursivResponse.json().catch(() => null) as {
    data?: {
      active?: boolean;
      tier?: string;
      status?: string;
      currentPeriodEnd?: string | null;
    };
    error?: string;
    message?: string;
  } | null;

  if (!recursivResponse.ok) {
    return jsonError(data?.message || data?.error || 'Payment could not be verified yet.', recursivResponse.status || 502);
  }

  const active = Boolean(data?.data?.active);
  const response = NextResponse.json({
    active,
    tier: data?.data?.tier ?? 'free',
    status: data?.data?.status ?? 'none',
    currentPeriodEnd: data?.data?.currentPeriodEnd ?? null,
    subscriptionId: null,
  });
  setAccessCookie(response, active);
  return response;
}
