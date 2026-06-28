import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { updateJsonStore } from './store';

type RateLimitBucket = {
  key: string;
  hits: number[];
  updatedAt: number;
};

type RateLimitStore = {
  buckets: RateLimitBucket[];
};

type RateLimitConfig = {
  bucket: string;
  identity?: string | null;
  limit: number;
  windowMs: number;
};

const STORE_KEY = 'world-iq:rate-limits:v1';
const STORE_FILE = 'world-iq-rate-limits.json';
const MAX_BUCKETS = 5000;
const MAX_BUCKET_AGE_MS = 24 * 60 * 60 * 1000;

function emptyStore(): RateLimitStore {
  return { buckets: [] };
}

function normalizeStore(parsed: Partial<RateLimitStore>): RateLimitStore {
  return {
    buckets: Array.isArray(parsed.buckets)
      ? parsed.buckets.filter((bucket): bucket is RateLimitBucket => (
        Boolean(bucket)
        && typeof bucket.key === 'string'
        && Array.isArray(bucket.hits)
        && typeof bucket.updatedAt === 'number'
      )).slice(-MAX_BUCKETS)
      : [],
  };
}

function requestIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const forwarded = request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || forwardedFor
    || 'unknown';
  return forwarded.replace(/[^a-zA-Z0-9:._-]+/g, '').slice(0, 96) || 'unknown';
}

function hashIdentity(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function cleanBucket(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').slice(0, 80) || 'route';
}

export async function enforceRateLimit(request: Request, config: RateLimitConfig) {
  const now = Date.now();
  const windowMs = Math.max(1000, Math.round(config.windowMs));
  const limit = Math.max(1, Math.round(config.limit));
  const identity = config.identity || `ip:${requestIp(request)}`;
  const key = `${cleanBucket(config.bucket)}:${hashIdentity(identity)}`;
  const windowStart = now - windowMs;
  const maxAgeStart = now - Math.max(MAX_BUCKET_AGE_MS, windowMs);

  const result = await updateJsonStore<Partial<RateLimitStore>, { limited: boolean; remaining: number; resetAt: number }>(
    STORE_KEY,
    emptyStore(),
    STORE_FILE,
    (parsed) => {
      const store = normalizeStore(parsed);
      store.buckets = store.buckets.filter((bucket) => bucket.updatedAt >= maxAgeStart || bucket.hits.some((hit) => hit >= maxAgeStart));
      let bucket = store.buckets.find((item) => item.key === key);
      if (!bucket) {
        bucket = { key, hits: [], updatedAt: now };
        store.buckets.push(bucket);
      }

      bucket.hits = bucket.hits.filter((hit) => hit >= windowStart);
      bucket.updatedAt = now;
      const resetAt = bucket.hits[0] ? bucket.hits[0] + windowMs : now + windowMs;
      if (bucket.hits.length >= limit) {
        store.buckets = store.buckets
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_BUCKETS);
        return {
          value: store,
          result: { limited: true, remaining: 0, resetAt },
        };
      }

      bucket.hits.push(now);
      store.buckets = store.buckets
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_BUCKETS);
      return {
        value: store,
        result: {
          limited: false,
          remaining: Math.max(0, limit - bucket.hits.length),
          resetAt,
        },
      };
    },
  );

  if (!result.limited) return null;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
  return NextResponse.json({
    error: 'Too many requests. Try again shortly.',
    retryAfter,
  }, {
    status: 429,
    headers: {
      'cache-control': 'no-store',
      'retry-after': String(retryAfter),
      'x-rate-limit-remaining': String(result.remaining),
      'x-rate-limit-reset': String(result.resetAt),
    },
  });
}
