import { NextResponse, type NextRequest } from 'next/server';
import { resolveBillingConfig } from '../_lib/billingConfig';
import { enforceRateLimit } from '../_lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requestOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'iqwars.app';
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function safeReturnUrl(value: unknown, origin: string) {
  if (typeof value !== 'string' || !value.trim()) return origin;
  try {
    const parsed = new URL(value, origin);
    const expected = new URL(origin);
    if (parsed.origin !== expected.origin) return origin;
    parsed.hash = '';
    parsed.searchParams.delete('sub');
    parsed.searchParams.delete('tier');
    return parsed.toString();
  } catch {
    return origin;
  }
}

function safeCheckoutUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if ((host === 'recursiv.io' || host.endsWith('.recursiv.io')) && /^\/(register|login|sign-in|sign-up)(\/|$)/.test(path)) {
      return null;
    }
    if (host === 'checkout.stripe.com' || host === 'buy.stripe.com' || host === 'recursiv.io' || host.endsWith('.recursiv.io')) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const playerApiKey = request.cookies.get(PLAYER_API_KEY_COOKIE)?.value || '';
  if (!playerApiKey) {
    return jsonError('Create an IQ WARS account before checkout.', 401);
  }
  const limited = await enforceRateLimit(request, {
    bucket: 'checkout:post',
    identity: `account:${playerApiKey}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const returnUrl = safeReturnUrl((body as { returnUrl?: unknown }).returnUrl, requestOrigin(request));
  const config = resolveBillingConfig();
  const tier = typeof (body as { tier?: unknown }).tier === 'string' && (body as { tier?: string }).tier
    ? (body as { tier: string }).tier
    : config.tier;
  if (!config.checkoutReady) {
    return jsonError('Paid upgrade is not configured yet. Your IQ WARS account is connected and the free daily test is active.', 503);
  }

  if (config.provider === 'payment_link' && config.paymentLinkUrl) {
    return NextResponse.json({
      url: config.paymentLinkUrl,
      provider: config.provider,
      tier: null,
    });
  }

  if (!tier) {
    return jsonError('Paid upgrade is not configured yet. Your IQ WARS account is connected and the free daily test is active.', 503);
  }

  const recursivResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/app-subscriptions/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${playerApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tier,
      return_url: returnUrl,
    }),
  });

  const data = await recursivResponse.json().catch(() => null) as { data?: { url?: string }, error?: string, message?: string } | null;
  const checkoutUrl = safeCheckoutUrl(data?.data?.url);
  if (!recursivResponse.ok || !checkoutUrl) {
    return jsonError(data?.message || data?.error || 'Could not open Recursiv checkout.', recursivResponse.ok ? 502 : recursivResponse.status || 502);
  }

  return NextResponse.json({ url: checkoutUrl, provider: config.provider, tier });
}
