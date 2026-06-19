import { NextRequest, NextResponse } from 'next/server';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const RECURSIV_API_KEY = process.env.IQWARS_RECURSIV_API_KEY || process.env.RECURSIV_API_KEY || '';

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 180) : '';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = cleanEmail(body?.email);

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }

  if (!RECURSIV_API_KEY) {
    return NextResponse.json({ error: 'IQ WARS auth is not configured yet.' }, { status: 503 });
  }

  const response = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RECURSIV_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { message?: string }, message?: string } | null;
    return NextResponse.json({ error: data?.error?.message || data?.message || 'Could not send code.' }, { status: response.status });
  }

  return NextResponse.json({ sent: true, branded: true });
}
