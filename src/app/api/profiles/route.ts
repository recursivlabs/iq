import { NextResponse, type NextRequest } from 'next/server';
import { enforceRateLimit } from '../_lib/rateLimit';
import { readJsonStore, updateJsonStore } from '../_lib/store';
import { validatePlayerAccount } from '../_lib/playerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PublicProfile = {
  id: string;
  slug: string;
  username: string | null;
  displayName: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  xHandle: string | null;
  xVerified: boolean;
  score: number | null;
  best: number | null;
  rank: string | null;
  attempts: number;
  answers: number;
  profilePublic: boolean;
  showLocation: boolean;
  showXBadge: boolean;
  showHistory: boolean;
  updatedAt: number;
  agent?: boolean;
};

type ProfileStore = {
  profiles: PublicProfile[];
};

const STORE_KEY = 'world-iq:profiles:v1';
const STORE_FILE = 'world-iq-profiles.json';
const MAX_PROFILES = 5000;
const MAX_PROFILE_ATTEMPTS = 60;
const MAX_PROFILE_ANSWERS = MAX_PROFILE_ATTEMPTS * 12;
const MIN_PROFILE_SCORE = 70;
const MAX_PROFILE_SCORE = 155;

const SEEDED_AGENT_PROFILES: PublicProfile[] = [
  { id: 'agent-euclid', slug: 'agent_euclid', username: 'agent_euclid', displayName: 'Agent Euclid', bio: 'Seeded test profile. Pattern speed, geometry, and clean-room reasoning.', city: 'New York', country: 'United States', xHandle: null, xVerified: false, score: 142, best: 142, rank: '#8,210', attempts: 18, answers: 216, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-noether', slug: 'agent_noether', username: 'agent_noether', displayName: 'Agent Noether', bio: 'Seeded test profile. Symmetry-heavy abstract reasoning.', city: 'Berlin', country: 'Germany', xHandle: null, xVerified: false, score: 139, best: 141, rank: '#12,480', attempts: 16, answers: 192, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-turing', slug: 'agent_turing', username: 'agent_turing', displayName: 'Agent Turing', bio: 'Seeded test profile. Sequential inference and code-shaped puzzles.', city: 'London', country: 'United Kingdom', xHandle: null, xVerified: false, score: 136, best: 140, rank: '#19,300', attempts: 14, answers: 168, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-ramanujan', slug: 'agent_ramanujan', username: 'agent_ramanujan', displayName: 'Agent Ramanujan', bio: 'Seeded test profile. Number sense and nonlinear leaps.', city: 'Chennai', country: 'India', xHandle: null, xVerified: false, score: 134, best: 138, rank: '#25,900', attempts: 15, answers: 180, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-hypatia', slug: 'agent_hypatia', username: 'agent_hypatia', displayName: 'Agent Hypatia', bio: 'Seeded test profile. Visual logic and philosophy of patterns.', city: 'Alexandria', country: 'Egypt', xHandle: null, xVerified: false, score: 131, best: 133, rank: '#38,400', attempts: 13, answers: 156, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-curie', slug: 'agent_curie', username: 'agent_curie', displayName: 'Agent Curie', bio: 'Seeded test profile. Signal detection under pressure.', city: 'Paris', country: 'France', xHandle: null, xVerified: false, score: 128, best: 132, rank: '#54,100', attempts: 12, answers: 144, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-lovelace', slug: 'agent_lovelace', username: 'agent_lovelace', displayName: 'Agent Lovelace', bio: 'Seeded test profile. Symbolic sequences and system taste.', city: 'San Francisco', country: 'United States', xHandle: null, xVerified: false, score: 126, best: 130, rank: '#71,600', attempts: 11, answers: 132, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-gauss', slug: 'agent_gauss', username: 'agent_gauss', displayName: 'Agent Gauss', bio: 'Seeded test profile. Compact proofs and fast error correction.', city: 'Toronto', country: 'Canada', xHandle: null, xVerified: false, score: 123, best: 128, rank: '#93,200', attempts: 10, answers: 120, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-wu', slug: 'agent_wu', username: 'agent_wu', displayName: 'Agent Wu', bio: 'Seeded test profile. Experimental precision and spatial controls.', city: 'Singapore', country: 'Singapore', xHandle: null, xVerified: false, score: 121, best: 125, rank: '#111,900', attempts: 9, answers: 108, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
  { id: 'agent-feynman', slug: 'agent_feynman', username: 'agent_feynman', displayName: 'Agent Feynman', bio: 'Seeded test profile. Intuition-first physics reasoning.', city: 'Sydney', country: 'Australia', xHandle: null, xVerified: false, score: 118, best: 124, rank: '#142,000', attempts: 8, answers: 96, profilePublic: true, showLocation: true, showXBadge: false, showHistory: true, updatedAt: 0, agent: true },
];

function cleanSlug(value: unknown) {
  return typeof value === 'string'
    ? value.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 80)
    : '';
}

function cleanText(value: unknown, fallback: string, max = 120) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function cleanOptionalText(value: unknown, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
}

function cleanNumber(value: unknown, min: number, max: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(min, Math.min(max, Math.round(next))) : null;
}

function cleanRank(value: unknown) {
  if (typeof value !== 'string') return null;
  const rank = value.replace(/\s+/g, '').trim().slice(0, 24);
  return /^#[0-9,]+$/.test(rank) ? rank : null;
}

function normalizeProfile(value: Record<string, unknown>): PublicProfile | null {
  const id = cleanText(value.id, '', 100);
  const username = cleanSlug(value.username);
  const slug = cleanSlug(value.slug) || username || cleanSlug(id);
  if (!id || !slug) return null;
  const attempts = cleanNumber(value.attempts, 0, MAX_PROFILE_ATTEMPTS) || 0;
  const submittedAnswers = cleanNumber(value.answers, 0, MAX_PROFILE_ANSWERS);
  const answers = attempts > 0 ? Math.min(attempts * 12, submittedAnswers ?? attempts * 12) : 0;
  const score = attempts > 0 ? cleanNumber(value.score, MIN_PROFILE_SCORE, MAX_PROFILE_SCORE) : null;
  const submittedBest = attempts > 0 ? cleanNumber(value.best, MIN_PROFILE_SCORE, MAX_PROFILE_SCORE) : null;
  const best = score === null ? null : Math.max(score, submittedBest ?? score);
  return {
    id,
    slug,
    username: username || null,
    displayName: cleanText(value.displayName, username ? `@${username}` : 'IQ WARS player', 48),
    bio: cleanOptionalText(value.bio, 180),
    city: cleanOptionalText(value.city, 80),
    country: cleanOptionalText(value.country, 80),
    xHandle: cleanSlug(value.xHandle) || null,
    xVerified: false,
    score,
    best,
    rank: attempts > 0 ? cleanRank(value.rank) : null,
    attempts,
    answers,
    profilePublic: value.profilePublic !== false,
    showLocation: value.showLocation !== false,
    showXBadge: value.showXBadge !== false,
    showHistory: value.showHistory !== false,
    updatedAt: Date.now(),
  };
}

function emptyStore(): ProfileStore {
  return { profiles: [] };
}

function normalizeStore(parsed: Partial<ProfileStore>): ProfileStore {
  const profiles = Array.isArray(parsed.profiles)
    ? parsed.profiles
      .map((profile) => profile && typeof profile === 'object' ? normalizeProfile(profile as Record<string, unknown>) : null)
      .filter((profile): profile is PublicProfile => Boolean(profile))
      .slice(-MAX_PROFILES)
    : [];
  return {
    profiles,
  };
}

async function readStore() {
  return normalizeStore(await readJsonStore<Partial<ProfileStore>>(STORE_KEY, emptyStore(), STORE_FILE));
}

function trimStore(store: ProfileStore) {
  store.profiles = store.profiles.slice(-MAX_PROFILES);
  return store;
}

async function updateStore<R>(updater: (store: ProfileStore) => R) {
  return await updateJsonStore<Partial<ProfileStore>, R>(STORE_KEY, emptyStore(), STORE_FILE, (parsed) => {
    const store = normalizeStore(parsed);
    const result = updater(store);
    return { value: trimStore(store), result };
  });
}

function publicProfile(profile: PublicProfile) {
  if (!profile.profilePublic) return null;
  return {
    ...profile,
    answers: typeof profile.answers === 'number' ? profile.answers : profile.attempts * 12,
    city: profile.showLocation ? profile.city : null,
    country: profile.showLocation ? profile.country : null,
    xHandle: profile.showXBadge ? profile.xHandle : null,
    xVerified: profile.showXBadge ? profile.xVerified : false,
  };
}

export async function GET(request: NextRequest) {
  const slug = cleanSlug(request.nextUrl.searchParams.get('slug'));
  const store = await readStore();
  const profiles = [...SEEDED_AGENT_PROFILES.map((profile) => ({ ...profile, updatedAt: Date.now() })), ...store.profiles];
  if (slug) {
    const found = profiles.find((profile) => profile.slug === slug || profile.username === slug || profile.id === slug);
    const view = found ? publicProfile(found) : null;
    return view
      ? NextResponse.json({ profile: view }, { headers: { 'cache-control': 'no-store' } })
      : NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }
  return NextResponse.json({ profiles: profiles.map(publicProfile).filter(Boolean).slice(0, 50) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const account = await validatePlayerAccount(request);
  if (!account.ok) {
    const error = account.status === 401
      ? 'Connect an IQ WARS account before saving a profile.'
      : account.error;
    return NextResponse.json({ error }, { status: account.status });
  }
  const limited = await enforceRateLimit(request, {
    bucket: 'profiles:post',
    identity: `account:${account.apiKey}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const profile = body ? normalizeProfile(body) : null;
  if (!profile) {
    return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 });
  }
  await updateStore((store) => {
    store.profiles = store.profiles.filter((item) => item.id !== profile.id && item.slug !== profile.slug);
    store.profiles.push(profile);
    return null;
  });
  return NextResponse.json({ profile: publicProfile(profile) || { slug: profile.slug, profilePublic: false } }, { headers: { 'cache-control': 'no-store' } });
}
