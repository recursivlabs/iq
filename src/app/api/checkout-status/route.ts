import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCESS_COOKIE = 'world_iq_paid';
const STRIPE_SESSION_URL = 'https://api.stripe.com/v1/checkout/sessions/';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return jsonError('Stripe checkout is not configured yet.', 503);
  }

  const sessionId = request.nextUrl.searchParams.get('session_id') || '';
  if (!sessionId.startsWith('cs_')) {
    return jsonError('Missing checkout session.', 400);
  }

  const stripeResponse = await fetch(`${STRIPE_SESSION_URL}${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
    cache: 'no-store',
  });

  const data = await stripeResponse.json().catch(() => null);
  if (!stripeResponse.ok) {
    return jsonError('Could not verify Stripe checkout.', 502);
  }

  const active = data?.status === 'complete' && (data?.payment_status === 'paid' || data?.payment_status === 'no_payment_required');
  const response = NextResponse.json({
    active,
    status: data?.status ?? null,
    paymentStatus: data?.payment_status ?? null,
    subscriptionId: data?.subscription ?? null,
  });

  if (active) {
    response.cookies.set({
      name: ACCESS_COOKIE,
      value: 'active',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 35,
      path: '/',
    });
  }

  return response;
}
