import { NextResponse, type NextRequest } from 'next/server';
import { readJsonStore, writeJsonStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SocialEntry = {
  id: string;
  day: string;
  playerId: string;
  displayName: string;
  username: string | null;
  groupCode: string | null;
  groupName: string | null;
  score: number;
  rank: string;
  percentile: number;
  correct: number;
  total: number;
  beatAi: number;
  elapsedMs: number | null;
  speedBonus: number | null;
  timestamp: number;
  geo?: GeoSnapshot | null;
};

type GeoSnapshot = {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  town: string | null;
  timeZone: string | null;
  source: string;
};

type GeoBoardRow = {
  id: string;
  kind: 'country' | 'city' | 'town';
  label: string;
  detail: string;
  score: number;
  entries: number;
  topScore: number;
};

type LeaderboardStore = {
  entries: SocialEntry[];
};

type SeededAgentProfile = Omit<SocialEntry, 'id' | 'day' | 'playerId' | 'groupCode' | 'groupName' | 'total' | 'speedBonus' | 'timestamp'> & {
  id: string;
  geo: GeoSnapshot;
};

const STORE_KEY = 'world-iq:leaderboards:v2';
const STORE_FILE = 'world-iq-leaderboards.json';
const MAX_ENTRIES = 5000;
const MAX_BOARD_ROWS = 50;
const MAX_GEO_ROWS = 20;

const SEEDED_AGENT_PROFILES = [
  { id: 'agent-euclid', displayName: 'Agent Euclid', username: 'agent_euclid', score: 142, rank: '#8,210', percentile: 99.2, correct: 11, elapsedMs: 424_000, beatAi: 4, geo: { country: 'United States', countryCode: 'US', region: 'New York', city: 'New York', town: 'New York', timeZone: 'America/New_York', source: 'agent_seed' } },
  { id: 'agent-noether', displayName: 'Agent Noether', username: 'agent_noether', score: 139, rank: '#12,480', percentile: 98.8, correct: 10, elapsedMs: 382_000, beatAi: 3, geo: { country: 'Germany', countryCode: 'DE', region: 'Berlin', city: 'Berlin', town: 'Berlin', timeZone: 'Europe/Berlin', source: 'agent_seed' } },
  { id: 'agent-turing', displayName: 'Agent Turing', username: 'agent_turing', score: 136, rank: '#19,300', percentile: 98.1, correct: 10, elapsedMs: 441_000, beatAi: 3, geo: { country: 'United Kingdom', countryCode: 'GB', region: 'England', city: 'London', town: 'London', timeZone: 'Europe/London', source: 'agent_seed' } },
  { id: 'agent-ramanujan', displayName: 'Agent Ramanujan', username: 'agent_ramanujan', score: 134, rank: '#25,900', percentile: 97.4, correct: 10, elapsedMs: 506_000, beatAi: 2, geo: { country: 'India', countryCode: 'IN', region: 'Tamil Nadu', city: 'Chennai', town: 'Chennai', timeZone: 'Asia/Kolkata', source: 'agent_seed' } },
  { id: 'agent-hypatia', displayName: 'Agent Hypatia', username: 'agent_hypatia', score: 131, rank: '#38,400', percentile: 96.2, correct: 9, elapsedMs: 365_000, beatAi: 3, geo: { country: 'Egypt', countryCode: 'EG', region: 'Alexandria', city: 'Alexandria', town: 'Alexandria', timeZone: 'Africa/Cairo', source: 'agent_seed' } },
  { id: 'agent-curie', displayName: 'Agent Curie', username: 'agent_curie', score: 128, rank: '#54,100', percentile: 94.6, correct: 9, elapsedMs: 458_000, beatAi: 2, geo: { country: 'France', countryCode: 'FR', region: 'Ile-de-France', city: 'Paris', town: 'Paris', timeZone: 'Europe/Paris', source: 'agent_seed' } },
  { id: 'agent-lovelace', displayName: 'Agent Lovelace', username: 'agent_lovelace', score: 126, rank: '#71,600', percentile: 92.8, correct: 9, elapsedMs: 533_000, beatAi: 2, geo: { country: 'United States', countryCode: 'US', region: 'California', city: 'San Francisco', town: 'San Francisco', timeZone: 'America/Los_Angeles', source: 'agent_seed' } },
  { id: 'agent-gauss', displayName: 'Agent Gauss', username: 'agent_gauss', score: 123, rank: '#93,200', percentile: 90.7, correct: 8, elapsedMs: 401_000, beatAi: 2, geo: { country: 'Canada', countryCode: 'CA', region: 'Ontario', city: 'Toronto', town: 'Toronto', timeZone: 'America/Toronto', source: 'agent_seed' } },
  { id: 'agent-wu', displayName: 'Agent Wu', username: 'agent_wu', score: 121, rank: '#111,900', percentile: 88.8, correct: 8, elapsedMs: 489_000, beatAi: 1, geo: { country: 'Singapore', countryCode: 'SG', region: null, city: 'Singapore', town: 'Singapore', timeZone: 'Asia/Singapore', source: 'agent_seed' } },
  { id: 'agent-feynman', displayName: 'Agent Feynman', username: 'agent_feynman', score: 118, rank: '#142,000', percentile: 85.8, correct: 8, elapsedMs: 557_000, beatAi: 1, geo: { country: 'Australia', countryCode: 'AU', region: 'New South Wales', city: 'Sydney', town: 'Sydney', timeZone: 'Australia/Sydney', source: 'agent_seed' } },
] satisfies SeededAgentProfile[];

function emptyStore(): LeaderboardStore {
  return { entries: [] };
}

function seededAgentEntries(day: string): SocialEntry[] {
  const base = Date.parse(`${day}T12:00:00.000Z`);
  return SEEDED_AGENT_PROFILES.map((agent, index) => ({
    id: `${day}:${agent.id}:seed`,
    day,
    playerId: agent.id,
    displayName: agent.displayName,
    username: agent.username,
    groupCode: null,
    groupName: null,
    score: agent.score,
    rank: agent.rank,
    percentile: agent.percentile,
    correct: agent.correct,
    total: 12,
    beatAi: agent.beatAi,
    elapsedMs: agent.elapsedMs,
    speedBonus: Math.max(0, Math.round((12 * 45_000 - agent.elapsedMs) / 70_000)),
    timestamp: base + index * 71_000,
    geo: agent.geo,
  }));
}

function sanitizeGroupCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function sanitizeUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 20);
}

function sanitizeText(value: unknown, fallback: string, max = 40) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function sanitizeOptionalText(value: unknown, max = 60) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
}

function sanitizeCountryCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return code.length === 2 ? code : null;
}

function sanitizeGeo(value: unknown): GeoSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const geo = value as Partial<GeoSnapshot>;
  const countryCode = sanitizeCountryCode(geo.countryCode);
  const country = sanitizeOptionalText(geo.country, 56);
  const city = sanitizeOptionalText(geo.city, 80);
  const town = sanitizeOptionalText(geo.town, 80);
  const region = sanitizeOptionalText(geo.region, 80);
  const timeZone = sanitizeOptionalText(geo.timeZone, 80);
  if (!country && !countryCode && !city && !town && !region && !timeZone) return null;
  return {
    country,
    countryCode,
    region,
    city,
    town,
    timeZone,
    source: sanitizeText(geo.source, 'unknown', 24),
  };
}

function isSocialEntry(value: unknown): value is SocialEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SocialEntry>;
  return typeof entry.day === 'string'
    && typeof entry.playerId === 'string'
    && typeof entry.displayName === 'string'
    && typeof entry.score === 'number'
    && typeof entry.rank === 'string'
    && typeof entry.percentile === 'number'
    && typeof entry.correct === 'number'
    && typeof entry.total === 'number'
    && typeof entry.beatAi === 'number'
    && typeof entry.timestamp === 'number';
}

async function readStore(): Promise<LeaderboardStore> {
  const parsed = await readJsonStore<Partial<LeaderboardStore>>(STORE_KEY, emptyStore(), STORE_FILE);
  return {
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isSocialEntry).slice(-MAX_ENTRIES) : [],
  };
}

async function writeStore(store: LeaderboardStore) {
  store.entries = store.entries.slice(-MAX_ENTRIES);
  await writeJsonStore(STORE_KEY, store, STORE_FILE);
}

function boardRows(entries: SocialEntry[]) {
  return [...entries]
    .sort((a, b) => b.score - a.score || b.beatAi - a.beatAi || (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER) || a.timestamp - b.timestamp)
    .slice(0, MAX_BOARD_ROWS);
}

function geoKey(entry: SocialEntry, kind: GeoBoardRow['kind']) {
  const geo = entry.geo;
  if (!geo) return null;
  if (kind === 'country') {
    const label = geo.country || geo.countryCode;
    return label ? { id: geo.countryCode || label.toLowerCase(), label, detail: geo.countryCode || 'country' } : null;
  }
  if (kind === 'city') {
    const label = geo.city;
    if (!label) return null;
    const detail = [geo.region, geo.countryCode || geo.country].filter(Boolean).join(' · ') || 'city';
    return { id: [label, geo.region, geo.countryCode || geo.country].filter(Boolean).join(':').toLowerCase(), label, detail };
  }
  const label = geo.town || geo.city;
  if (!label) return null;
  const detail = [geo.city && geo.city !== label ? geo.city : null, geo.region, geo.countryCode || geo.country].filter(Boolean).join(' · ') || 'town';
  return { id: [label, geo.city, geo.region, geo.countryCode || geo.country].filter(Boolean).join(':').toLowerCase(), label, detail };
}

function geoRows(entries: SocialEntry[], day: string, kind: GeoBoardRow['kind']): GeoBoardRow[] {
  const bestByPlaceAndPlayer = new Map<string, SocialEntry & { geoKey: ReturnType<typeof geoKey> }>();
  for (const entry of entries) {
    if (entry.day !== day) continue;
    const key = geoKey(entry, kind);
    if (!key) continue;
    const playerKey = `${key.id}:${entry.playerId}`;
    const existing = bestByPlaceAndPlayer.get(playerKey);
    if (!existing || entry.score > existing.score || (entry.score === existing.score && entry.timestamp < existing.timestamp)) {
      bestByPlaceAndPlayer.set(playerKey, { ...entry, geoKey: key });
    }
  }

  const places = new Map<string, { label: string; detail: string; scores: number[] }>();
  for (const entry of bestByPlaceAndPlayer.values()) {
    const key = entry.geoKey;
    if (!key) continue;
    const place = places.get(key.id) || { label: key.label, detail: key.detail, scores: [] };
    place.scores.push(entry.score);
    places.set(key.id, place);
  }

  return [...places.entries()]
    .map(([id, place]) => {
      const topScore = Math.max(...place.scores);
      const score = Math.round(place.scores.reduce((total, value) => total + value, 0) / place.scores.length);
      return { id, kind, label: place.label, detail: place.detail, score, entries: place.scores.length, topScore };
    })
    .sort((a, b) => b.score - a.score || b.entries - a.entries || b.topScore - a.topScore || a.label.localeCompare(b.label))
    .slice(0, MAX_GEO_ROWS);
}

function geographyRows(entries: SocialEntry[], day: string) {
  return {
    countries: geoRows(entries, day, 'country'),
    cities: geoRows(entries, day, 'city'),
    towns: geoRows(entries, day, 'town'),
  };
}

function globalRows(entries: SocialEntry[], day: string) {
  const bestByPlayer = new Map<string, SocialEntry>();
  for (const entry of entries) {
    if (entry.day !== day) continue;
    const existing = bestByPlayer.get(entry.playerId);
    if (!existing || entry.score > existing.score || (entry.score === existing.score && entry.timestamp < existing.timestamp)) {
      bestByPlayer.set(entry.playerId, entry);
    }
  }
  return boardRows([...bestByPlayer.values()]);
}

function groupRows(entries: SocialEntry[], day: string, groupCode: string) {
  return boardRows(entries.filter((entry) => entry.day === day && entry.groupCode === groupCode && !entry.playerId.startsWith('agent-')));
}

export async function GET(request: NextRequest) {
  const day = sanitizeText(request.nextUrl.searchParams.get('day'), new Date().toISOString().slice(0, 10), 10);
  const groupCode = sanitizeGroupCode(request.nextUrl.searchParams.get('group'));
  const store = await readStore();
  const entries = [...seededAgentEntries(day), ...store.entries];

  return NextResponse.json({
    day,
    global: globalRows(entries, day),
    group: groupCode ? groupRows(entries, day, groupCode) : [],
    geography: geographyRows(entries, day),
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid leaderboard entry.' }, { status: 400 });
  }

  const day = sanitizeText(body.day, new Date().toISOString().slice(0, 10), 10);
  const playerId = sanitizeText(body.playerId, '', 80);
  if (!playerId) {
    return NextResponse.json({ error: 'Missing player.' }, { status: 400 });
  }

  const score = Number(body.score);
  const correct = Number(body.correct);
  const total = Number(body.total);
  const percentile = Number(body.percentile);
  const beatAi = Number(body.beatAi);
  const elapsedMs = Number(body.elapsedMs);
  const speedBonus = Number(body.speedBonus);
  if (![score, correct, total, percentile, beatAi].every(Number.isFinite)) {
    return NextResponse.json({ error: 'Invalid score.' }, { status: 400 });
  }

  const groupCode = sanitizeGroupCode(body.groupCode) || null;
  const groupName = groupCode ? sanitizeText(body.groupName, groupCode.toUpperCase(), 48) : null;
  const entry: SocialEntry = {
    id: `${day}:${playerId}:${groupCode || 'global'}`,
    day,
    playerId,
    displayName: sanitizeText(body.displayName, 'Anonymous', 32),
    username: sanitizeUsername(body.username) || null,
    groupCode,
    groupName,
    score: Math.max(0, Math.min(200, Math.round(score))),
    rank: sanitizeText(body.rank, '#--', 20),
    percentile: Math.max(0, Math.min(100, percentile)),
    correct: Math.max(0, Math.min(99, Math.round(correct))),
    total: Math.max(1, Math.min(99, Math.round(total))),
    beatAi: Math.max(0, Math.min(99, Math.round(beatAi))),
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.min(86_400_000, Math.round(elapsedMs))) : null,
    speedBonus: Number.isFinite(speedBonus) ? Math.max(0, Math.min(50, Math.round(speedBonus))) : null,
    timestamp: Date.now(),
    geo: sanitizeGeo(body.geo),
  };

  const store = await readStore();
  const existingIndex = store.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    entry.timestamp = store.entries[existingIndex].timestamp;
    store.entries[existingIndex] = { ...store.entries[existingIndex], displayName: entry.displayName, username: entry.username, groupName: entry.groupName, geo: entry.geo };
  } else {
    store.entries.push(entry);
  }
  await writeStore(store);

  return NextResponse.json({
    accepted: existingIndex < 0,
    entry: existingIndex >= 0 ? store.entries[existingIndex] : entry,
    global: globalRows([...seededAgentEntries(day), ...store.entries], day),
    group: groupCode ? groupRows([...seededAgentEntries(day), ...store.entries], day, groupCode) : [],
    geography: geographyRows([...seededAgentEntries(day), ...store.entries], day),
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
