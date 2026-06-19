import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || '';

type XUserResponse = {
  data?: {
    id: string;
    username: string;
    name?: string;
    location?: string;
    verified?: boolean;
    verified_type?: string;
    public_metrics?: { followers_count?: number };
  };
  errors?: Array<{ message?: string }>;
};

type XTweetsResponse = {
  data?: Array<{ id: string; text?: string; created_at?: string }>;
  errors?: Array<{ message?: string }>;
};

function cleanHandle(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]+/g, '').slice(0, 15) : '';
}

function cleanToken(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 80) : '';
}

function profilePayload(user: NonNullable<XUserResponse['data']>) {
  return {
    handle: user.username,
    name: user.name || null,
    location: user.location || null,
    followers: user.public_metrics?.followers_count ?? null,
    verified: Boolean(user.verified || user.verified_type),
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { handle?: unknown; token?: unknown } | null;
  const handle = cleanHandle(body?.handle);
  const token = cleanToken(body?.token);

  if (!handle || !token) {
    return NextResponse.json({ error: 'Missing X handle or scorecard token.' }, { status: 400 });
  }

  if (!X_BEARER_TOKEN) {
    return NextResponse.json({ error: 'X verification API is not configured yet.' }, { status: 503 });
  }

  const userResponse = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=location,public_metrics,verified,verified_type,description`, {
    headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
    cache: 'no-store',
  });
  const userData = await userResponse.json().catch(() => null) as XUserResponse | null;
  const user = userData?.data;
  if (!userResponse.ok || !user?.id) {
    return NextResponse.json({ error: userData?.errors?.[0]?.message || 'X account was not found.' }, { status: userResponse.status || 404 });
  }

  const tweetsResponse = await fetch(`https://api.twitter.com/2/users/${encodeURIComponent(user.id)}/tweets?max_results=10&tweet.fields=created_at`, {
    headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
    cache: 'no-store',
  });
  const tweetsData = await tweetsResponse.json().catch(() => null) as XTweetsResponse | null;
  if (!tweetsResponse.ok) {
    return NextResponse.json({ error: tweetsData?.errors?.[0]?.message || 'Could not read recent X posts.' }, { status: tweetsResponse.status || 502 });
  }

  const verified = (tweetsData?.data || []).some((tweet) => {
    const text = tweet.text || '';
    return text.includes(token) && /IQ\s*WARS/i.test(text);
  });

  if (!verified) {
    return NextResponse.json({ verified: false, profile: profilePayload(user), error: 'Scorecard post was not found yet.' }, { status: 404 });
  }

  return NextResponse.json({ verified: true, profile: profilePayload(user) });
}
