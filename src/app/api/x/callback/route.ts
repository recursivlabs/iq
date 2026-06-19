import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const X_CLIENT_ID = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || '';
const STATE_COOKIE = 'iqwars_x_state';
const VERIFIER_COOKIE = 'iqwars_x_verifier';
const RETURN_COOKIE = 'iqwars_x_return';

type XTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type XUserResponse = {
  data?: {
    id: string;
    username: string;
    name?: string;
    location?: string;
    public_metrics?: { followers_count?: number };
  };
  errors?: Array<{ message?: string }>;
};

function requestOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'iqwars.app';
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function safeReturnPath(value: string | undefined, origin: string) {
  if (!value) return '/';
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function redirectWithParams(request: NextRequest, returnPath: string, params: Record<string, string | number | null | undefined>) {
  const origin = requestOrigin(request);
  const url = new URL(safeReturnPath(returnPath, origin), origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(RETURN_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const returnPath = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value, origin);
  const expectedState = request.cookies.get(STATE_COOKIE)?.value || '';
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value || '';
  const state = request.nextUrl.searchParams.get('state') || '';
  const code = request.nextUrl.searchParams.get('code') || '';
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return redirectWithParams(request, returnPath, { x_status: error === 'access_denied' ? 'cancelled' : 'failed' });
  }

  if (!X_CLIENT_ID || !code || !verifier || !expectedState || expectedState !== state) {
    return redirectWithParams(request, returnPath, { x_status: 'failed' });
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${origin}/api/x/callback`,
    code_verifier: verifier,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')}`;
  } else {
    body.set('client_id', X_CLIENT_ID);
  }

  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers,
    body,
  });
  const tokenData = await tokenResponse.json().catch(() => null) as XTokenResponse | null;
  if (!tokenResponse.ok || !tokenData?.access_token) {
    return redirectWithParams(request, returnPath, { x_status: 'failed' });
  }

  const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=location,public_metrics,verified,verified_type,description', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userData = await userResponse.json().catch(() => null) as XUserResponse | null;
  const user = userData?.data;
  if (!userResponse.ok || !user?.username) {
    return redirectWithParams(request, returnPath, { x_status: 'failed' });
  }

  return redirectWithParams(request, returnPath, {
    x_verified: '1',
    x_handle: user.username,
    x_name: user.name || null,
    x_location: user.location || null,
    x_followers: user.public_metrics?.followers_count ?? null,
  });
}
