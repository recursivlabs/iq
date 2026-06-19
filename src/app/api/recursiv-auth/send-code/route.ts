import { NextRequest, NextResponse } from 'next/server';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 180) : '';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = cleanEmail(body?.email);

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }

  const response = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: RECURSIV_AUTH_ORIGIN,
    },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { message?: string }, message?: string } | null;
    return NextResponse.json({ error: data?.error?.message || data?.message || 'Could not send code.' }, { status: response.status });
  }

  return NextResponse.json({ sent: true, branded: true });
}
