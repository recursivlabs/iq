import { createHash, randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const X_CLIENT_ID = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
const STATE_COOKIE = 'iqwars_x_state';
const VERIFIER_COOKIE = 'iqwars_x_verifier';
const RETURN_COOKIE = 'iqwars_x_return';

function requestOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'iqwars.app';
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function safeReturnPath(request: NextRequest) {
  const origin = requestOrigin(request);
  const candidate = request.nextUrl.searchParams.get('returnTo') || request.headers.get('referer') || '/';
  try {
    const parsed = new URL(candidate, origin);
    if (parsed.origin !== origin) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function base64Url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function redirectWithStatus(origin: string, returnPath: string, status: string) {
  const url = new URL(returnPath || '/', origin);
  url.searchParams.set('x_status', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const returnPath = safeReturnPath(request);

  if (!X_CLIENT_ID) {
    return redirectWithStatus(origin, returnPath, 'not_configured');
  }

  const state = base64Url(randomBytes(24));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const redirectUri = `${origin}/api/x/callback`;
  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', X_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'users.read tweet.read offline.access');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl);
  const secure = origin.startsWith('https://');
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 600 };
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, verifier, cookieOptions);
  response.cookies.set(RETURN_COOKIE, returnPath, cookieOptions);
  return response;
}
