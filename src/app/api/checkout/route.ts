import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_PRICE_CENTS = 499;
const DEFAULT_PRODUCT_NAME = 'World IQ Unlimited';
const STRIPE_CHECKOUT_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requestOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'iq.on.recursiv.io';
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
    return parsed.toString();
  } catch {
    return origin;
  }
}

function checkoutReturnUrl(baseUrl: string, status: 'success' | 'cancelled') {
  const url = new URL(baseUrl);
  url.searchParams.set('checkout', status);
  if (status === 'success') {
    url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  }
  return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}

function configuredPriceCents() {
  const value = Number.parseInt(process.env.IQ_STRIPE_PRICE_CENTS || '', 10);
  if (Number.isFinite(value) && value >= 100) return value;
  return DEFAULT_PRICE_CENTS;
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return jsonError('Stripe checkout is not configured yet.', 503);
  }

  const body = await request.json().catch(() => ({}));
  const returnUrl = safeReturnUrl((body as { returnUrl?: unknown }).returnUrl, requestOrigin(request));
  const productName = process.env.IQ_STRIPE_PRODUCT_NAME || DEFAULT_PRODUCT_NAME;

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', checkoutReturnUrl(returnUrl, 'success'));
  params.set('cancel_url', checkoutReturnUrl(returnUrl, 'cancelled'));
  params.set('allow_promotion_codes', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(configuredPriceCents()));
  params.set('line_items[0][price_data][recurring][interval]', 'month');
  params.set('line_items[0][price_data][product_data][name]', productName);
  params.set('line_items[0][price_data][product_data][description]', 'Unlimited World IQ attempts, saved rank, and deep report access.');
  params.set('metadata[app]', 'world-iq');
  params.set('subscription_data[metadata][app]', 'world-iq');

  const stripeResponse = await fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const data = await stripeResponse.json().catch(() => null);
  if (!stripeResponse.ok || typeof data?.url !== 'string') {
    return jsonError('Could not start Stripe checkout.', 502);
  }

  return NextResponse.json({
    url: data.url,
    sessionId: data.id,
  });
}
