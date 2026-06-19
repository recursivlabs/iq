'use client';

import * as React from 'react';
import { detectBrowserLocale, localeLabel, translate, type LocaleKey } from './i18n';

type ModeKey = 'world' | 'agi' | 'daily';
type ViewKey = 'test' | 'rankings' | 'about';
type TileTone = 'ink' | 'blue' | 'green' | 'rose' | 'amber';

type PatternTile = {
  dots: number;
  bars: number;
  ring: boolean;
  tilt: number;
  tone: TileTone;
};

type Puzzle = {
  id: string;
  mode: ModeKey;
  title: string;
  difficulty: string;
  prompt: string;
  matrix: Array<PatternTile | null>;
  options: PatternTile[];
  answerIndex: number;
  aiSolved: boolean;
};

type AnswerRecord = {
  id: string;
  selected: number;
  correct: boolean;
  aiSolved: boolean;
};

type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  mode: string;
  accuracy: string;
  qualifier: string;
  timestamp: number;
  local?: boolean;
};

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

type XVerificationRecord = {
  handle: string;
  status: 'pending_post' | 'verified';
  method: 'post' | 'oauth';
  proofToken?: string | null;
  name?: string | null;
  location?: string | null;
  followers?: number | null;
  updatedAt: number;
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

type GlobeRegion = GeoBoardRow & {
  x: number;
  y: number;
  heat: number;
  size: number;
  hue: number;
};

type SocialBoards = {
  global: SocialEntry[];
  group: SocialEntry[];
  geography: {
    countries: GeoBoardRow[];
    cities: GeoBoardRow[];
    towns: GeoBoardRow[];
  };
};

type PlayUsage = {
  day: string;
  count: number;
};

type RecursivAccountRecord = {
  email: string;
  name?: string | null;
  updatedAt: number;
};

type OfficialRankRecord = {
  day: string;
  score: number;
  rank: string;
  percentile: number;
  correct: number;
  total: number;
  beatAi: number;
  elapsedMs?: number | null;
  speedBonus?: number | null;
  timestamp: number;
};

type IqProfile = {
  attempts: number;
  score: number | null;
  best: number | null;
  trend: number | null;
  confidence: string;
};

type SoundKind = 'tap' | 'select' | 'commit' | 'copy' | 'success' | 'error';

const DAILY_PLAY_LIMIT = 1;
const UNLIMITED_PRICE_LABEL = '$4.99/mo';
const RECURSIV_AUTH_URL = 'https://recursiv.io/auth';
const RECURSIV_GOOGLE_SIGNUP_URL = RECURSIV_AUTH_URL;
const LEGACY_FREE_PLAY_STORAGE_KEY = 'world-iq-free-play-date';
const PLAY_USAGE_STORAGE_KEY = 'world-iq-play-usage';
const LEADERBOARD_STORAGE_KEY = 'world-iq-leaderboard';
const OFFICIAL_RANK_STORAGE_KEY = 'world-iq-official-rank';
const OFFICIAL_HISTORY_STORAGE_KEY = 'world-iq-official-history';
const OFFICIAL_HISTORY_LIMIT = 60;
const PLAYER_ID_STORAGE_KEY = 'world-iq-player-id';
const PLAYER_NAME_STORAGE_KEY = 'world-iq-player-name';
const PLAYER_USERNAME_STORAGE_KEY = 'world-iq-player-username';
const GROUP_CODE_STORAGE_KEY = 'world-iq-group-code';
const GROUP_NAME_STORAGE_KEY = 'world-iq-group-name';
const REMINDER_EMAIL_STORAGE_KEY = 'world-iq-reminder-email';
const RECURSIV_ACCOUNT_STORAGE_KEY = 'world-iq-recursiv-account';
const X_VERIFICATION_STORAGE_KEY = 'world-iq-x-verification';
const EMPTY_GEOGRAPHY_BOARDS: SocialBoards['geography'] = { countries: [], cities: [], towns: [] };
const COUNTRY_GLOBE_CENTERS: Record<string, [number, number]> = {
  US: [-98, 39],
  CA: [-106, 56],
  MX: [-102, 23],
  BR: [-52, -10],
  AR: [-64, -34],
  GB: [-2, 54],
  IE: [-8, 53],
  FR: [2, 46],
  DE: [10, 51],
  ES: [-4, 40],
  IT: [12, 43],
  NL: [5, 52],
  SE: [15, 62],
  NO: [8, 61],
  PL: [19, 52],
  RU: [90, 60],
  TR: [35, 39],
  IN: [78, 22],
  CN: [104, 35],
  JP: [138, 37],
  KR: [128, 36],
  SG: [104, 1],
  ID: [118, -2],
  AU: [134, -25],
  NZ: [172, -42],
  ZA: [24, -29],
  NG: [8, 9],
  EG: [30, 27],
  AE: [54, 24],
  SA: [45, 24],
};

const tones: Record<TileTone, string> = {
  ink: '#f4f5f6',
  blue: '#c9cdd1',
  green: '#a9afb4',
  rose: '#858b91',
  amber: '#dfe2e4',
};

const modes: Record<ModeKey, { label: string; title: string; body: string; cta: string }> = {
  world: {
    label: 'Today\'s IQ WARS',
    title: 'Complete the full baseline.',
    body: 'First visit is the full 12-question run. One official attempt per day makes the score harder to fake and better over time.',
    cta: 'Start today',
  },
  agi: {
    label: 'AI Blind Spots',
    title: 'See where humans still beat AI.',
    body: 'A lab mode of abstraction puzzles selected around model blind spots and human pattern discovery.',
    cta: 'Challenge AI',
  },
  daily: {
    label: 'Daily Sprint',
    title: 'One hard puzzle. No ramp.',
    body: 'A pressure puzzle for streaks and group chats. IQ WARS is the official ranked mode.',
    cta: 'Sprint',
  },
};

const seededLeaderboard: LeaderboardEntry[] = [];

function tile(dots: number, bars: number, ring: boolean, tilt: number, tone: TileTone): PatternTile {
  return { dots, bars, ring, tilt, tone };
}

const worldPuzzles: Puzzle[] = [
  {
    id: 'world-01',
    mode: 'world',
    title: 'Additive count',
    difficulty: 'Warmup',
    prompt: 'Complete the final tile.',
    matrix: [tile(1, 0, false, 0, 'ink'), tile(2, 0, false, 0, 'ink'), tile(3, 0, false, 0, 'ink'), tile(2, 0, false, 0, 'ink'), tile(3, 0, false, 0, 'ink'), tile(4, 0, false, 0, 'ink'), tile(3, 0, false, 0, 'ink'), tile(4, 0, false, 0, 'ink'), null],
    options: [tile(2, 1, false, 0, 'ink'), tile(5, 0, false, 0, 'ink'), tile(4, 1, false, 0, 'ink'), tile(1, 2, false, 0, 'ink')],
    answerIndex: 1,
    aiSolved: true,
  },
  {
    id: 'world-02',
    mode: 'world',
    title: 'Rotating bars',
    difficulty: 'Warmup',
    prompt: 'Find the rotation that keeps the sequence intact.',
    matrix: [tile(1, 1, false, 0, 'blue'), tile(1, 1, false, 45, 'blue'), tile(1, 1, false, 90, 'blue'), tile(2, 1, false, 0, 'blue'), tile(2, 1, false, 45, 'blue'), tile(2, 1, false, 90, 'blue'), tile(3, 1, false, 0, 'blue'), tile(3, 1, false, 45, 'blue'), null],
    options: [tile(3, 1, false, 90, 'blue'), tile(1, 3, false, 0, 'blue'), tile(2, 2, false, 45, 'blue'), tile(4, 0, true, 0, 'blue')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-03',
    mode: 'world',
    title: 'Ring alternation',
    difficulty: 'Basic',
    prompt: 'Choose the missing ring state.',
    matrix: [tile(1, 0, true, 0, 'green'), tile(2, 0, false, 0, 'green'), tile(3, 0, true, 0, 'green'), tile(1, 1, false, 0, 'green'), tile(2, 1, true, 0, 'green'), tile(3, 1, false, 0, 'green'), tile(1, 2, true, 0, 'green'), tile(2, 2, false, 0, 'green'), null],
    options: [tile(3, 2, true, 0, 'green'), tile(2, 2, true, 0, 'green'), tile(3, 1, true, 0, 'green'), tile(1, 2, false, 0, 'green')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-04',
    mode: 'world',
    title: 'Diagonal emphasis',
    difficulty: 'Basic',
    prompt: 'Complete the diagonal pattern.',
    matrix: [tile(2, 1, true, 0, 'rose'), tile(1, 2, false, 0, 'rose'), tile(2, 1, false, 0, 'rose'), tile(1, 2, false, 45, 'rose'), tile(2, 1, true, 45, 'rose'), tile(1, 2, false, 45, 'rose'), tile(2, 1, false, 90, 'rose'), tile(1, 2, false, 90, 'rose'), null],
    options: [tile(2, 1, true, 90, 'rose'), tile(1, 2, true, 90, 'rose'), tile(2, 2, false, 90, 'rose'), tile(3, 1, true, 45, 'rose')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-05',
    mode: 'world',
    title: 'Column sum',
    difficulty: 'Medium',
    prompt: 'The bottom row combines the two above it.',
    matrix: [tile(1, 1, false, 0, 'amber'), tile(2, 0, false, 0, 'amber'), tile(1, 2, false, 0, 'amber'), tile(2, 0, false, 0, 'amber'), tile(1, 1, false, 0, 'amber'), tile(2, 1, false, 0, 'amber'), tile(3, 1, true, 0, 'amber'), tile(3, 1, true, 0, 'amber'), null],
    options: [tile(3, 2, true, 0, 'amber'), tile(2, 3, false, 0, 'amber'), tile(4, 1, true, 0, 'amber'), tile(1, 3, true, 0, 'amber')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-06',
    mode: 'world',
    title: 'Odd one out',
    difficulty: 'Medium',
    prompt: 'Find the tile that completes the only consistent row.',
    matrix: [tile(1, 2, false, 0, 'blue'), tile(2, 1, true, 0, 'blue'), tile(3, 0, false, 0, 'blue'), tile(2, 2, false, 45, 'blue'), tile(3, 1, true, 45, 'blue'), tile(4, 0, false, 45, 'blue'), tile(3, 2, false, 90, 'blue'), tile(4, 1, true, 90, 'blue'), null],
    options: [tile(5, 0, false, 90, 'blue'), tile(4, 0, true, 90, 'blue'), tile(5, 1, false, 45, 'blue'), tile(3, 0, false, 90, 'blue')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-07',
    mode: 'world',
    title: 'Shape conservation',
    difficulty: 'Medium',
    prompt: 'Preserve the row totals.',
    matrix: [tile(4, 0, true, 0, 'green'), tile(2, 1, false, 0, 'green'), tile(0, 2, true, 0, 'green'), tile(3, 1, true, 45, 'green'), tile(1, 2, false, 45, 'green'), tile(1, 1, true, 45, 'green'), tile(2, 2, true, 90, 'green'), tile(2, 0, false, 90, 'green'), null],
    options: [tile(0, 1, true, 90, 'green'), tile(1, 2, true, 90, 'green'), tile(3, 0, false, 90, 'green'), tile(0, 2, false, 90, 'green')],
    answerIndex: 0,
    aiSolved: false,
  },
  {
    id: 'world-08',
    mode: 'world',
    title: 'Mirror transform',
    difficulty: 'Medium',
    prompt: 'Complete the mirrored transform.',
    matrix: [tile(1, 1, false, 0, 'rose'), tile(2, 1, true, 45, 'rose'), tile(1, 1, false, 90, 'rose'), tile(2, 2, false, 0, 'rose'), tile(3, 2, true, 45, 'rose'), tile(2, 2, false, 90, 'rose'), tile(3, 1, false, 0, 'rose'), tile(4, 1, true, 45, 'rose'), null],
    options: [tile(3, 1, false, 90, 'rose'), tile(4, 1, false, 90, 'rose'), tile(3, 2, true, 90, 'rose'), tile(2, 1, false, 45, 'rose')],
    answerIndex: 0,
    aiSolved: true,
  },
  {
    id: 'world-09',
    mode: 'world',
    title: 'Dual axis',
    difficulty: 'Hard',
    prompt: 'Track two axes at once.',
    matrix: [tile(1, 0, false, 0, 'amber'), tile(1, 1, false, 45, 'amber'), tile(1, 2, false, 90, 'amber'), tile(2, 0, true, 45, 'amber'), tile(2, 1, true, 90, 'amber'), tile(2, 2, true, 0, 'amber'), tile(3, 0, false, 90, 'amber'), tile(3, 1, false, 0, 'amber'), null],
    options: [tile(3, 2, false, 45, 'amber'), tile(3, 2, true, 45, 'amber'), tile(2, 2, false, 0, 'amber'), tile(4, 1, false, 45, 'amber')],
    answerIndex: 0,
    aiSolved: false,
  },
  {
    id: 'world-10',
    mode: 'world',
    title: 'Inversion',
    difficulty: 'Hard',
    prompt: 'Choose the inverted final tile.',
    matrix: [tile(0, 3, true, 0, 'ink'), tile(2, 2, false, 0, 'ink'), tile(4, 1, true, 0, 'ink'), tile(1, 3, false, 45, 'ink'), tile(3, 2, true, 45, 'ink'), tile(5, 1, false, 45, 'ink'), tile(2, 3, true, 90, 'ink'), tile(4, 2, false, 90, 'ink'), null],
    options: [tile(6, 1, true, 90, 'ink'), tile(5, 2, true, 90, 'ink'), tile(6, 0, false, 90, 'ink'), tile(4, 1, true, 45, 'ink')],
    answerIndex: 0,
    aiSolved: false,
  },
  {
    id: 'world-11',
    mode: 'world',
    title: 'Nested logic',
    difficulty: 'Hard',
    prompt: 'Combine count, ring, and tilt.',
    matrix: [tile(1, 1, true, 0, 'blue'), tile(2, 2, false, 45, 'blue'), tile(3, 0, true, 90, 'blue'), tile(2, 2, false, 45, 'green'), tile(3, 0, true, 90, 'green'), tile(4, 1, false, 0, 'green'), tile(3, 0, true, 90, 'rose'), tile(4, 1, false, 0, 'rose'), null],
    options: [tile(5, 2, true, 45, 'rose'), tile(4, 2, true, 45, 'rose'), tile(5, 1, false, 45, 'rose'), tile(3, 2, true, 0, 'rose')],
    answerIndex: 0,
    aiSolved: false,
  },
  {
    id: 'world-12',
    mode: 'world',
    title: 'Final synthesis',
    difficulty: 'Elite',
    prompt: 'Finish the complete reasoning matrix.',
    matrix: [tile(2, 0, true, 0, 'amber'), tile(1, 1, false, 45, 'blue'), tile(3, 1, true, 90, 'green'), tile(3, 1, false, 45, 'blue'), tile(2, 2, true, 90, 'green'), tile(4, 2, false, 0, 'rose'), tile(4, 2, true, 90, 'green'), tile(3, 3, false, 0, 'rose'), null],
    options: [tile(5, 3, true, 45, 'amber'), tile(4, 3, true, 45, 'amber'), tile(5, 2, false, 45, 'amber'), tile(6, 3, true, 90, 'amber')],
    answerIndex: 0,
    aiSolved: false,
  },
];

const agiPuzzles: Puzzle[] = ['world-07', 'world-09', 'world-10', 'world-11', 'world-12', 'world-08']
  .map((id, index) => {
    const source = worldPuzzles.find((puzzle) => puzzle.id === id)!;
    return {
      ...source,
      id: `agi-${index + 1}`,
      mode: 'agi' as const,
      title: ['Counterexample', 'Abstraction', 'Inversion', 'Program shift', 'Few-shot synthesis', 'Mirror trap'][index],
      difficulty: index < 2 ? 'AI baseline' : index < 4 ? 'AI hard' : 'AI frontier',
      prompt: 'Solve the abstraction before the model baseline does.',
    };
  });

const dailyPuzzles: Puzzle[] = [
  { ...worldPuzzles[8], id: 'daily-01', mode: 'daily', title: 'Daily dual axis', difficulty: 'Hard', prompt: 'One hard puzzle for today. Lock your answer.' },
  { ...worldPuzzles[10], id: 'daily-02', mode: 'daily', title: 'Daily nested logic', difficulty: 'Hard', prompt: 'One hard puzzle for today. Lock your answer.' },
  { ...worldPuzzles[11], id: 'daily-03', mode: 'daily', title: 'Daily synthesis', difficulty: 'Elite', prompt: 'One hard puzzle for today. Lock your answer.' },
];

const rankedWorldPuzzleIds = [
  'world-01',
  'world-02',
  'world-03',
  'world-04',
  'world-05',
  'world-06',
  'world-07',
  'world-08',
  'world-09',
  'world-10',
  'world-11',
  'world-12',
];

const rankedWorldPuzzles: Puzzle[] = rankedWorldPuzzleIds.map((id, index) => {
  const source = worldPuzzles.find((puzzle) => puzzle.id === id)!;
  const difficulty = index === 0
    ? 'Calibration'
    : index < 3
      ? 'Foundation'
      : index < 6
        ? 'Adaptive'
        : index < 8
          ? 'Advanced'
          : index < 11
            ? 'Frontier'
            : 'Elite';
  return {
    ...source,
    difficulty,
    prompt: index === 0 ? 'Start with the signal. The board ramps quickly.' : source.prompt,
  };
});

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function cleanGroupCode(value: string | null | undefined) {
  return (value || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function groupNameFromCode(code: string) {
  if (!code) return '';
  return code.split('-').filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(' ');
}

function randomRoomCode() {
  const chunk = Math.random().toString(36).slice(2, 8);
  return `room-${chunk}`;
}

function currentOrigin() {
  if (typeof window === 'undefined') return 'https://iqwars.app';
  return window.location.origin;
}

function groupShareUrl(groupCode: string | null) {
  return groupCode ? `${currentOrigin()}/g/${groupCode}` : currentOrigin();
}

function normalizeCountryCode(value: string | null | undefined) {
  if (!value) return null;
  const code = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return code.length === 2 ? code : null;
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function countryFromBrowserLocale() {
  if (typeof navigator === 'undefined') return null;
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    try {
      const parsed = new Intl.Locale(locale);
      const code = normalizeCountryCode(parsed.region || null);
      if (code) return code;
    } catch {
      const code = normalizeCountryCode(locale.match(/[-_]([A-Za-z]{2})\b/)?.[1]);
      if (code) return code;
    }
  }
  return null;
}

function cityFromTimeZone(timeZone: string | null) {
  if (!timeZone || !timeZone.includes('/')) return null;
  const raw = timeZone.split('/').pop() || '';
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function fallbackGeoSnapshot(): GeoSnapshot | null {
  if (typeof window === 'undefined') return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const countryCode = countryFromBrowserLocale();
  const city = cityFromTimeZone(timeZone);
  if (!countryCode && !city && !timeZone) return null;
  return {
    country: countryName(countryCode),
    countryCode,
    region: null,
    city,
    town: city,
    timeZone,
    source: city ? 'timezone' : countryCode ? 'locale' : 'unknown',
  };
}

function normalizeGeoSnapshot(value: unknown): GeoSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const geo = value as Partial<GeoSnapshot>;
  const hasSignal = geo.country || geo.countryCode || geo.city || geo.town || geo.region || geo.timeZone;
  if (!hasSignal) return null;
  return {
    country: typeof geo.country === 'string' && geo.country.trim() ? geo.country.trim() : null,
    countryCode: normalizeCountryCode(geo.countryCode),
    region: typeof geo.region === 'string' && geo.region.trim() ? geo.region.trim() : null,
    city: typeof geo.city === 'string' && geo.city.trim() ? geo.city.trim() : null,
    town: typeof geo.town === 'string' && geo.town.trim() ? geo.town.trim() : null,
    timeZone: typeof geo.timeZone === 'string' && geo.timeZone.trim() ? geo.timeZone.trim() : null,
    source: typeof geo.source === 'string' && geo.source.trim() ? geo.source.trim() : 'unknown',
  };
}

function cleanXHandle(value: string | null | undefined) {
  return (value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]+/g, '').slice(0, 15);
}

function normalizeXVerification(value: unknown): XVerificationRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<XVerificationRecord>;
  const handle = cleanXHandle(record.handle);
  if (!handle) return null;
  const status = record.status === 'verified' ? 'verified' : 'pending_post';
  const method = record.method === 'oauth' ? 'oauth' : 'post';
  return {
    handle,
    status,
    method,
    proofToken: typeof record.proofToken === 'string' && record.proofToken.trim() ? record.proofToken.trim().slice(0, 80) : null,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 80) : null,
    location: typeof record.location === 'string' && record.location.trim() ? record.location.trim().slice(0, 120) : null,
    followers: typeof record.followers === 'number' && Number.isFinite(record.followers) ? Math.max(0, Math.floor(record.followers)) : null,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  };
}

function readXVerification(): XVerificationRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(X_VERIFICATION_STORAGE_KEY);
    return raw ? normalizeXVerification(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeXVerification(record: XVerificationRecord | null) {
  if (typeof window === 'undefined') return;
  if (!record) {
    window.localStorage.removeItem(X_VERIFICATION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(X_VERIFICATION_STORAGE_KEY, JSON.stringify({ ...record, updatedAt: Date.now() }));
}

function geoFromXLocation(location: string | null | undefined): GeoSnapshot | null {
  if (!location) return null;
  const parts = location.split(',').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!parts.length) return null;
  const countryCandidate = parts[parts.length - 1] || null;
  const countryCode = normalizeCountryCode(countryCandidate || undefined);
  const city = parts.length > 1 ? parts[0] : null;
  return {
    country: countryCode ? countryName(countryCode) : countryCandidate,
    countryCode,
    region: parts.length > 2 ? parts.slice(1, -1).join(', ') : null,
    city,
    town: city,
    timeZone: null,
    source: 'x_profile',
  };
}

function xProofToken(record: OfficialRankRecord, playerId: string) {
  const playerSeed = (playerId || 'iqwars').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'IQWARS';
  return `IQWARS-${record.day.replace(/-/g, '')}-${record.score}-${playerSeed}`;
}

function buildXScorecardText(record: OfficialRankRecord, groupCode: string | null, groupName: string, playerId: string) {
  const token = xProofToken(record, playerId);
  const roomLine = groupCode ? `\nRoom: ${groupName}\n${groupShareUrl(groupCode)}` : `\n${currentOrigin()}`;
  return {
    token,
    text: `IQ WARS ${record.day}: ${record.score} reasoning | ${record.rank} | ${record.correct}/${record.total} | ${formatElapsedTime(record.elapsedMs)}\n${token}${roomLine}`,
  };
}

function xIntentUrl(text: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function hashNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function globeCoordinateFromLabel(label: string, detail: string, kind: GeoBoardRow['kind']): [number, number] {
  const code = normalizeCountryCode(kind === 'country' ? detail || label : detail.match(/\b([A-Z]{2})\b/)?.[1]);
  if (code && COUNTRY_GLOBE_CENTERS[code]) return COUNTRY_GLOBE_CENTERS[code];
  const hash = hashNumber(`${label}:${detail}:${kind}`);
  const lon = ((hash % 320) / 320) * 300 - 150;
  const lat = ((((hash / 320) | 0) % 140) / 140) * 110 - 55;
  return [lon, lat];
}

function projectGlobePoint(lon: number, lat: number) {
  const lambda = ((lon + 18) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const depth = Math.cos(lambda) * cosPhi;
  return {
    x: 50 + Math.sin(lambda) * cosPhi * 43,
    y: 50 - Math.sin(phi) * 43,
    depth,
  };
}

function buildGlobeRegions(geography: SocialBoards['geography'], fallbackGeo: GeoSnapshot | null): GlobeRegion[] {
  const rows = [...geography.countries, ...geography.cities.slice(0, 8), ...geography.towns.slice(0, 5)];
  if (!rows.length && fallbackGeo) {
    rows.push({
      id: fallbackGeo.countryCode || fallbackGeo.city || fallbackGeo.timeZone || 'local',
      kind: fallbackGeo.countryCode ? 'country' : 'city',
      label: fallbackGeo.city || fallbackGeo.country || fallbackGeo.timeZone || 'Local signal',
      detail: [fallbackGeo.region, fallbackGeo.countryCode || fallbackGeo.country].filter(Boolean).join(' · ') || fallbackGeo.source,
      score: 100,
      entries: 1,
      topScore: 100,
    });
  }

  const maxEntries = Math.max(1, ...rows.map((row) => row.entries));
  return rows
    .map((row) => {
      const [lon, lat] = globeCoordinateFromLabel(row.label, row.detail, row.kind);
      const projected = projectGlobePoint(lon, lat);
      const scoreHeat = Math.max(0, Math.min(1, (row.score - 90) / 55));
      const trafficHeat = Math.max(0.18, Math.min(1, row.entries / maxEntries));
      return {
        ...row,
        x: Math.max(8, Math.min(92, projected.x)),
        y: Math.max(8, Math.min(92, projected.y)),
        heat: Math.max(0.22, Math.min(1, scoreHeat * 0.68 + trafficHeat * 0.32)),
        size: Math.round(9 + trafficHeat * 18 + scoreHeat * 9),
        hue: row.score >= 130 ? 42 : row.score >= 116 ? 178 : 210,
      };
    })
    .sort((a, b) => b.heat - a.heat || b.entries - a.entries || b.score - a.score)
    .slice(0, 18);
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for embedded/mobile browsers that expose Clipboard but reject writes.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is unavailable.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }

  if (!copied) {
    throw new Error('Clipboard is unavailable.');
  }
}

function useInteractionSoundLayer() {
  const audioRef = React.useRef<AudioContext | null>(null);
  const lastPlayedAtRef = React.useRef(0);

  return React.useCallback((kind: SoundKind = 'tap') => {
    if (typeof window === 'undefined') return;
    const now = window.performance.now();
    if (kind === 'tap' && now - lastPlayedAtRef.current < 42) return;
    lastPlayedAtRef.current = now;

    const AudioCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = audioRef.current || new AudioCtor();
    audioRef.current = ctx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    const t = ctx.currentTime;
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, t);
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(kind === 'commit' ? 0.032 : kind === 'success' ? 0.026 : 0.018, t + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    filter.connect(master);
    master.connect(ctx.destination);

    const notes: Record<SoundKind, Array<[number, number, number, OscillatorType]>> = {
      tap: [[880, 0, 0.045, 'sine'], [1320, 0.008, 0.035, 'sine']],
      select: [[520, 0, 0.055, 'triangle'], [780, 0.018, 0.045, 'sine']],
      commit: [[220, 0, 0.075, 'sine'], [440, 0.018, 0.075, 'triangle'], [880, 0.04, 0.065, 'sine']],
      copy: [[660, 0, 0.05, 'sine'], [990, 0.022, 0.055, 'sine']],
      success: [[740, 0, 0.07, 'sine'], [1110, 0.038, 0.085, 'triangle']],
      error: [[196, 0, 0.09, 'sine'], [147, 0.035, 0.07, 'sine']],
    };

    notes[kind].forEach(([frequency, delay, duration, type]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, t + delay);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.006, t + delay + duration);
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.9, t + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start(t + delay);
      oscillator.stop(t + delay + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });

    window.setTimeout(() => {
      filter.disconnect();
      master.disconnect();
    }, 320);
  }, []);
}

function readStoredGroupCode(initialGroupCode?: string) {
  const cleanedInitial = cleanGroupCode(initialGroupCode);
  if (cleanedInitial) return cleanedInitial;
  if (typeof window === 'undefined') return '';
  const queryGroup = cleanGroupCode(new URLSearchParams(window.location.search).get('g'));
  if (queryGroup) return queryGroup;
  return cleanGroupCode(window.localStorage.getItem(GROUP_CODE_STORAGE_KEY) || '');
}

function writeStoredGroup(code: string, name?: string) {
  if (typeof window === 'undefined' || !code) return;
  window.localStorage.setItem(GROUP_CODE_STORAGE_KEY, code);
  window.localStorage.setItem(GROUP_NAME_STORAGE_KEY, name || groupNameFromCode(code));
}

function readStoredGroupName(code: string) {
  if (!code) return '';
  if (typeof window === 'undefined') return groupNameFromCode(code);
  const saved = window.localStorage.getItem(GROUP_NAME_STORAGE_KEY);
  return saved?.trim() || groupNameFromCode(code);
}

function readPlayerId() {
  if (typeof window === 'undefined') return 'server-player';
  const existing = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, next);
  return next;
}

function defaultPlayerName(playerId: string) {
  return `Player ${playerId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || 'IQ'}`;
}

function readPlayerName(playerId: string) {
  if (typeof window === 'undefined') return defaultPlayerName(playerId);
  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || defaultPlayerName(playerId);
}

function writePlayerName(name: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name.trim().slice(0, 32));
}

function readClaimedUsername() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem(PLAYER_USERNAME_STORAGE_KEY) || '').trim().replace(/^@+/, '').toLowerCase();
}

function writeClaimedUsername(username: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_USERNAME_STORAGE_KEY, username.trim().replace(/^@+/, '').toLowerCase());
}

function cleanUsernameInput(value: string) {
  return value.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '').slice(0, 20);
}

function readReminderEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REMINDER_EMAIL_STORAGE_KEY) || '';
}

function writeReminderEmail(email: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REMINDER_EMAIL_STORAGE_KEY, email.trim().slice(0, 120));
}

function todayPuzzle() {
  const day = Math.floor(Date.now() / 86_400_000);
  return dailyPuzzles[day % dailyPuzzles.length];
}

function tileSignature(pattern: PatternTile) {
  return `${pattern.dots}:${pattern.bars}:${pattern.ring ? 1 : 0}:${pattern.tilt}:${pattern.tone}`;
}

function decoyTiles(puzzle: Puzzle): PatternTile[] {
  const seed = puzzle.id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  const tones: TileTone[] = ['ink', 'blue', 'green', 'rose', 'amber'];
  const tilts = [0, 45, 90];
  return Array.from({ length: 10 }, (_, index) => tile(
    (seed + index * 2) % 7,
    ((seed + index) % 3) + 1,
    (seed + index) % 2 === 0,
    tilts[(seed + index * 2) % tilts.length],
    tones[(seed + index * 3) % tones.length],
  ));
}

function withSixOptions(puzzle: Puzzle): Puzzle {
  if (puzzle.options.length >= 6) return puzzle;
  const used = new Set(puzzle.options.map(tileSignature));
  const options = [...puzzle.options];
  for (const decoy of decoyTiles(puzzle)) {
    if (options.length >= 6) break;
    const signature = tileSignature(decoy);
    if (used.has(signature)) continue;
    used.add(signature);
    options.push(decoy);
  }
  return {
    ...puzzle,
    options,
  };
}

function getQuestions(mode: ModeKey) {
  if (mode === 'agi') return agiPuzzles.map(withSixOptions);
  if (mode === 'daily') return [withSixOptions(todayPuzzle())];
  return rankedWorldPuzzles.map(withSixOptions);
}

function percentileFromScore(correct: number, total: number) {
  if (total <= 1) return correct ? 92 : 41;
  const ratio = correct / total;
  if (ratio >= 1) return 99.9;
  if (ratio >= 0.92) return 99.2;
  if (ratio >= 0.83) return 97;
  if (ratio >= 0.67) return 90;
  if (ratio >= 0.5) return 74;
  if (ratio >= 0.34) return 58;
  return 37;
}

function speedBonusFromElapsed(elapsedMs: number | null | undefined, total: number) {
  if (!elapsedMs || total <= 1) return 0;
  const targetMs = total * 45_000;
  const ratio = Math.max(0, Math.min(1, 1 - elapsedMs / targetMs));
  return Math.round(ratio * 8);
}

function worldIqScore(correct: number, total: number, elapsedMs?: number | null) {
  if (total === 1) return correct ? 138 : 104;
  return Math.round(90 + (correct / total) * 52 + speedBonusFromElapsed(elapsedMs, total));
}

function liveIqScoreProjection(answers: AnswerRecord[], total: number, elapsedMs?: number | null) {
  if (!answers.length || total <= 0) return 100;
  const correct = answers.filter((answer) => answer.correct).length;
  const centeredSignal = (correct - answers.length * 0.5) / total;
  const speedLift = Math.min(5, speedBonusFromElapsed(elapsedMs, total));
  return Math.max(70, Math.min(155, Math.round(100 + centeredSignal * 84 + speedLift)));
}

function formatElapsedTime(ms: number | null | undefined) {
  const safeMs = Math.max(0, Math.round(ms || 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

function formatRank(percentile: number) {
  const rank = Math.max(1, Math.round(1_000_000 * ((100 - percentile) / 100)));
  return `#${rank.toLocaleString()}`;
}

function blankPlayUsage(): PlayUsage {
  return { day: localDayKey(), count: 0 };
}

function normalizePlayUsage(value: unknown): PlayUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Partial<PlayUsage>;
  if (typeof usage.day !== 'string' || typeof usage.count !== 'number') return null;
  return {
    day: usage.day,
    count: Math.max(0, Math.min(DAILY_PLAY_LIMIT, Math.floor(usage.count))),
  };
}

function readPlayUsage(): PlayUsage {
  if (typeof window === 'undefined') return blankPlayUsage();
  try {
    const raw = window.localStorage.getItem(PLAY_USAGE_STORAGE_KEY);
    const parsed = raw ? normalizePlayUsage(JSON.parse(raw)) : null;
    if (parsed) return parsed.day === localDayKey() ? parsed : blankPlayUsage();
  } catch {
    // Fall through to the legacy one-play date migration.
  }

  const legacyDay = window.localStorage.getItem(LEGACY_FREE_PLAY_STORAGE_KEY);
  if (legacyDay) {
    const migrated = legacyDay === localDayKey() ? { day: legacyDay, count: 1 } : blankPlayUsage();
    writePlayUsage(migrated);
    return migrated;
  }

  return blankPlayUsage();
}

function writePlayUsage(usage: PlayUsage) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAY_USAGE_STORAGE_KEY, JSON.stringify(usage));
  window.localStorage.removeItem(LEGACY_FREE_PLAY_STORAGE_KEY);
}

function playsRemaining(usage: PlayUsage) {
  if (readOfficialRank()) return 0;
  const count = usage.day === localDayKey() ? usage.count : 0;
  return Math.max(0, DAILY_PLAY_LIMIT - count);
}

function consumePlay() {
  const current = readPlayUsage();
  const next = {
    day: localDayKey(),
    count: Math.min(DAILY_PLAY_LIMIT, (current.day === localDayKey() ? current.count : 0) + 1),
  };
  writePlayUsage(next);
  return next;
}

function readSavedEntries(): LeaderboardEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);
}

function getLeaderboardEntries() {
  return sortEntries([...readSavedEntries(), ...seededLeaderboard]).slice(0, 8);
}

function saveLeaderboardEntry(entry: LeaderboardEntry) {
  if (typeof window === 'undefined') return;
  const saved = readSavedEntries().filter((item) => item.id !== entry.id);
  window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(sortEntries([entry, ...saved]).slice(0, 6)));
}

function readOfficialRank(): OfficialRankRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OFFICIAL_RANK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<OfficialRankRecord> : null;
    if (!parsed || parsed.day !== localDayKey()) return null;
    if (typeof parsed.score !== 'number' || typeof parsed.rank !== 'string') return null;
    return parsed as OfficialRankRecord;
  } catch {
    return null;
  }
}

function writeOfficialRank(record: OfficialRankRecord) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFICIAL_RANK_STORAGE_KEY, JSON.stringify(record));
}

function isOfficialRankRecord(value: unknown): value is OfficialRankRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<OfficialRankRecord>;
  return typeof record.day === 'string'
    && typeof record.score === 'number'
    && typeof record.rank === 'string'
    && typeof record.percentile === 'number'
    && typeof record.correct === 'number'
    && typeof record.total === 'number'
    && typeof record.beatAi === 'number'
    && typeof record.timestamp === 'number';
}

function sortOfficialHistory(history: OfficialRankRecord[]) {
  return [...history].sort((a, b) => b.timestamp - a.timestamp);
}

function readOfficialHistory(): OfficialRankRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFICIAL_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(parsed) ? parsed.filter(isOfficialRankRecord) : [];
    const today = readOfficialRank();
    const merged = today && !history.some((entry) => entry.day === today.day) ? [today, ...history] : history;
    return sortOfficialHistory(merged).slice(0, OFFICIAL_HISTORY_LIMIT);
  } catch {
    const today = readOfficialRank();
    return today ? [today] : [];
  }
}

function writeOfficialHistory(history: OfficialRankRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFICIAL_HISTORY_STORAGE_KEY, JSON.stringify(sortOfficialHistory(history).slice(0, OFFICIAL_HISTORY_LIMIT)));
}

function saveOfficialHistory(record: OfficialRankRecord) {
  const existing = readOfficialHistory().filter((entry) => entry.day !== record.day);
  writeOfficialHistory([record, ...existing]);
}

function getIqProfile(history: OfficialRankRecord[]): IqProfile {
  if (!history.length) {
    return { attempts: 0, score: null, best: null, trend: null, confidence: 'Unrated' };
  }

  const chronological = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const recent = chronological.slice(-14);
  const weighted = recent.reduce((total, entry, index) => total + entry.score * (index + 1), 0);
  const weights = recent.reduce((total, _entry, index) => total + index + 1, 0);
  const latest = chronological[chronological.length - 1];
  const previous = chronological[chronological.length - 2];

  return {
    attempts: chronological.length,
    score: Math.round(weighted / weights),
    best: Math.max(...chronological.map((entry) => entry.score)),
    trend: previous ? latest.score - previous.score : null,
    confidence: chronological.length >= 14 ? 'Stable profile' : chronological.length >= 7 ? 'Emerging profile' : 'Calibrating',
  };
}

function formatTrend(trend: number | null) {
  if (trend === null) return 'first official day';
  if (trend === 0) return 'even vs previous day';
  return `${trend > 0 ? '+' : ''}${trend} vs previous day`;
}

function readRecursivAccount(): RecursivAccountRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RECURSIV_ACCOUNT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<RecursivAccountRecord> : null;
    if (!parsed?.email || typeof parsed.email !== 'string') return null;
    return {
      email: parsed.email,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeRecursivAccount(record: Omit<RecursivAccountRecord, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECURSIV_ACCOUNT_STORAGE_KEY, JSON.stringify({ ...record, updatedAt: Date.now() }));
}

function clearCheckoutQuery() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  url.searchParams.delete('sub');
  url.searchParams.delete('tier');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function sharePattern(answers: AnswerRecord[]) {
  return answers.map((answer) => (answer.correct ? '1' : '0')).join('');
}

function buildShareText({
  locale,
  mode,
  score,
  rank,
  percentile,
  correct,
  total,
  beatAi,
  elapsedMs,
  speedBonus,
  answers,
  status,
  groupCode,
  groupName,
}: {
  locale: LocaleKey;
  mode: ModeKey;
  score: number;
  rank: string;
  percentile: number;
  correct: number;
  total: number;
  beatAi: number;
  elapsedMs: number | null;
  speedBonus: number;
  answers: AnswerRecord[];
  status: 'official' | 'practice' | 'daily' | 'lab' | 'pending';
  groupCode: string | null;
  groupName: string;
}) {
  const copy = (text: string) => translate(locale, text);
  const topLabel = percentile >= 99.9 ? 'top 0.1%' : `top ${(100 - percentile).toFixed(percentile >= 99 ? 1 : 0)}%`;
  const roomLine = groupCode ? `\n${copy('Room')}: ${groupName}\n${groupShareUrl(groupCode)}` : `\n${currentOrigin().replace(/^https?:\/\//, '')}`;
  const timeLine = `${formatElapsedTime(elapsedMs)} · +${speedBonus} ${copy('speed')}`;
  if (mode === 'world') {
    const label = status === 'practice' ? copy('IQ WARS practice') : `IQ WARS ${localDayKey()}`;
    return `${label}: ${score} ${copy('reasoning')} | ${rank} | ${topLabel} | ${correct}/${total} | ${timeLine} | ${copy('AI misses')} ${beatAi}\n${sharePattern(answers)}${roomLine}`;
  }
  if (mode === 'agi') {
    return `${copy('AI Blind Spots')}: ${score} ${copy('reasoning')} | ${correct}/${total} | ${timeLine} | ${copy('AI misses')} ${beatAi}\n${sharePattern(answers)}${roomLine}`;
  }
  return `${copy('Daily Sprint')}: ${score} ${copy('reasoning')} | ${rank} | ${correct}/${total} | ${timeLine}\n${sharePattern(answers)}${roomLine}`;
}

function PatternTileView({ tile: pattern, selected = false }: { tile: PatternTile | null; selected?: boolean }) {
  if (!pattern) {
    return (
      <div className="tile missing">
        <span>?</span>
      </div>
    );
  }

  const tone = tones[pattern.tone];
  return (
    <div className={`tile ${selected ? 'selected' : ''}`} style={{ borderColor: selected ? tone : undefined }}>
      {pattern.ring ? <div className="ring" style={{ borderColor: tone }} /> : null}
      <div className="bars" style={{ transform: `rotate(${pattern.tilt}deg)` }}>
        {Array.from({ length: Math.max(0, Math.min(pattern.bars, 3)) }).map((_, index) => (
          <span key={index} style={{ background: tone }} />
        ))}
      </div>
      <div className="dots">
        {Array.from({ length: Math.max(0, Math.min(pattern.dots, 6)) }).map((_, index) => (
          <span key={index} style={{ background: tone }} />
        ))}
      </div>
    </div>
  );
}

function SignalSculpture() {
  return (
    <div className="signal-sculpture" aria-hidden="true">
      <span className="symbol dotset g1" />
      <span className="symbol bars g2" />
      <span className="symbol ring-symbol g3" />
      <span className="symbol missing-symbol g4" />
      <span className="symbol matrix-symbol g5" />
      <span className="symbol dotset g6" />
      <span className="symbol bars g7" />
      <span className="symbol ring-symbol g8" />
      <span className="symbol matrix-symbol g9" />
      <span className="symbol missing-symbol accent g10" />
    </div>
  );
}

function IqProfilePanel({ history, onUnlock, locale }: { history: OfficialRankRecord[]; onUnlock: () => void; locale: LocaleKey }) {
  const copy = (text: string) => translate(locale, text);
  const profile = getIqProfile(history);
  const recent = sortOfficialHistory(history).slice(0, 14).reverse();

  return (
    <section className="profile-panel" aria-label={copy('Developing IQ WARS profile')}>
      <div className="section-head">
        <div>
          <p className="kicker">{copy('Developing IQ')}</p>
          <h2>{profile.score ? `${profile.score} ${copy('rolling score')}` : copy('Build your score over time.')}</h2>
          <p>{profile.attempts > 0
            ? `${copy(profile.confidence)}. ${copy('One official attempt per day keeps the score honest and lets the profile mature over time.')}`
            : copy('Your profile starts with the first official attempt. Each daily result becomes one signal in the rolling score.')}</p>
        </div>
        <button className="secondary" onClick={onUnlock}>{copy('Save profile')}</button>
      </div>

      <div className="profile-stats">
        <div><strong>{profile.score ?? '---'}</strong><span>{copy('rolling IQ')}</span></div>
        <div><strong>{profile.attempts}</strong><span>{copy('official days')}</span></div>
        <div><strong>{profile.best ?? '---'}</strong><span>{copy('best score')}</span></div>
        <div><strong>{copy(formatTrend(profile.trend))}</strong><span>{copy('trajectory')}</span></div>
      </div>

      <div className="history-strip" aria-label={copy('Recent official score history')}>
        {recent.length ? (
          recent.map((entry) => (
            <div key={entry.day} className="history-day">
              <span>{entry.day.slice(5).replace('-', '/')}</span>
              <i style={{ height: `${Math.max(18, Math.min(84, (entry.score - 90) * 1.45))}px` }} />
              <strong>{entry.score}</strong>
            </div>
          ))
        ) : (
          <div className="empty-board">
            <strong>{copy('No official days yet.')}</strong>
            <span>{copy('Take today\'s one official attempt to create the first point in the score history.')}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Leaderboard({ entries, onUnlock }: { entries: LeaderboardEntry[]; onUnlock: () => void }) {
  return (
    <section className="leaderboard" id="rankings">
      <div className="section-head">
        <div>
          <p className="kicker">Founding rank board</p>
          <h2>The daily reasoning board opens with verified first attempts.</h2>
          <p>Only the first completed IQ WARS run each day is submitted. Practice runs and lab modes stay private.</p>
        </div>
        <button className="secondary" onClick={onUnlock}>Verify rank</button>
      </div>
      <div className="leaderboard-rows">
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <div key={entry.id} className={`leaderboard-row ${entry.local ? 'local' : ''}`}>
              <div className="rank">#{index + 1}</div>
              <div className="leader-copy">
                <strong>{entry.name}</strong>
                <span>{entry.mode} - {entry.qualifier}</span>
              </div>
              <div className="leader-score">
                <strong>{entry.score}</strong>
                <span>{entry.accuracy}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-board">
            <strong>No official ranks yet.</strong>
            <span>Finish Today&apos;s IQ WARS to create the first local verified entry.</span>
          </div>
        )}
      </div>
      <p className="trust-note">Ranks are entertainment and competition signals. They are not clinical IQ scores or eligibility for any high-IQ society.</p>
    </section>
  );
}

function SocialLeaderboard({
  locale,
  kicker,
  title,
  description,
  entries,
  empty,
  cta,
  onCta,
}: {
  locale: LocaleKey;
  kicker: string;
  title: string;
  description: string;
  entries: SocialEntry[];
  empty: string;
  cta: string;
  onCta: () => void | Promise<void>;
}) {
  const copy = (text: string) => translate(locale, text);
  const ctaCopied = cta === copy('Link copied');
  return (
    <section className="leaderboard social-board">
      <div className="section-head">
        <div>
          <p className="kicker">{kicker}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button className={`secondary ${ctaCopied ? 'copied' : ''}`} onClick={onCta}>{cta}</button>
      </div>
      <div className="leaderboard-rows">
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <div key={entry.id} className={`leaderboard-row ${index === 0 ? 'local' : ''}`}>
              <div className="rank">#{index + 1}</div>
              <div className="leader-copy">
                <strong>{entry.username ? `@${entry.username}` : entry.displayName}</strong>
                <span>{entry.groupName ? `${entry.groupName} - ` : ''}{entry.correct}/{entry.total} · {formatElapsedTime(entry.elapsedMs)} · {entry.beatAi} {copy('AI misses')}</span>
              </div>
              <div className="leader-score">
                <strong>{entry.score}</strong>
                <span>{entry.rank}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-board">
            <strong>{empty}</strong>
            <span>{copy('Finish Today\'s IQ WARS to put the first verified score on this board.')}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function GeographyLeaderboard({ locale, geography }: { locale: LocaleKey; geography: SocialBoards['geography'] }) {
  const copy = (text: string) => translate(locale, text);
  const boards = [
    { key: 'countries', kicker: copy('Countries'), entries: geography.countries },
    { key: 'cities', kicker: copy('Cities'), entries: geography.cities },
    { key: 'towns', kicker: copy('Towns'), entries: geography.towns },
  ];
  const hasAny = boards.some((board) => board.entries.length > 0);

  return (
    <section className="leaderboard geography-board">
      <div className="section-head">
        <div>
          <p className="kicker">{copy('Geography board')}</p>
          <h2>{copy('Where the sharpest daily scores are coming from.')}</h2>
          <p>{copy('Countries, cities, and towns are ranked by average verified score today, deduped by player.')}</p>
        </div>
      </div>
      <div className="geo-grid">
        {boards.map((board) => (
          <article key={board.key} className="geo-column">
            <div className="geo-column-head">
              <span>{board.kicker}</span>
              <strong>{board.entries.length}</strong>
            </div>
            <div className="leaderboard-rows geo-rows">
              {board.entries.length > 0 ? (
                board.entries.map((entry, index) => (
                  <div key={entry.id} className={`leaderboard-row ${index === 0 ? 'local' : ''}`}>
                    <div className="rank">#{index + 1}</div>
                    <div className="leader-copy">
                      <strong>{entry.label}</strong>
                      <span>{entry.detail} · {entry.entries} {copy(entry.entries === 1 ? 'player' : 'players')} · {copy('top')} {entry.topScore}</span>
                    </div>
                    <div className="leader-score">
                      <strong>{entry.score}</strong>
                      <span>{copy('avg')}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-board">
                  <strong>{copy('No geography ranks yet.')}</strong>
                  <span>{copy('Official scores with inferred location will appear here automatically.')}</span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {!hasAny ? <p className="trust-note">{copy('No location prompt is required. IQ WARS uses edge geography when available and timezone as a fallback.')}</p> : null}
    </section>
  );
}

function GeoGlobePanel({
  locale,
  geography,
  fallbackGeo,
}: {
  locale: LocaleKey;
  geography: SocialBoards['geography'];
  fallbackGeo: GeoSnapshot | null;
}) {
  const copy = (text: string) => translate(locale, text);
  const regions = React.useMemo(() => buildGlobeRegions(geography, fallbackGeo), [geography, fallbackGeo]);
  const topRegion = regions[0] || null;
  const totalEntries = regions.reduce((total, region) => total + region.entries, 0);

  return (
    <section className="rail-panel geo-globe-panel" aria-label={copy('IQ WARS geography globe')}>
      <div className="globe-copy">
        <p className="rail-label">{copy('World signal')}</p>
        <strong>{topRegion ? topRegion.label : copy('Awaiting traffic')}</strong>
        <span>{topRegion
          ? `${copy('Top active region')} · ${topRegion.score} ${copy('avg')} · ${topRegion.entries} ${copy(topRegion.entries === 1 ? 'player' : 'players')}`
          : copy('Live score heat appears as regions lock official runs.')}</span>
      </div>
      <div className="globe-shell" aria-hidden="true">
        <div className="globe-orbit orbit-a" />
        <div className="globe-orbit orbit-b" />
        <div className="globe-sphere">
          <div className="globe-grid latitude" />
          <div className="globe-grid longitude" />
          {regions.map((region, index) => (
            <span
              key={`${region.kind}-${region.id}-${index}`}
              className="globe-region"
              style={{
                left: `${region.x}%`,
                top: `${region.y}%`,
                width: `${region.size}px`,
                height: `${region.size}px`,
                opacity: 0.48 + region.heat * 0.46,
                background: `hsl(${region.hue} 76% ${48 + region.heat * 20}%)`,
                boxShadow: `0 0 ${16 + region.heat * 34}px hsla(${region.hue}, 86%, 64%, ${0.26 + region.heat * 0.42})`,
                animationDelay: `${index * -0.42}s`,
              }}
              title={`${region.label}: ${region.score}`}
            />
          ))}
        </div>
      </div>
      <div className="globe-metrics">
        <div><strong>{regions.length}</strong><span>{copy('regions')}</span></div>
        <div><strong>{totalEntries || '0'}</strong><span>{copy('signals')}</span></div>
      </div>
    </section>
  );
}

function XVerificationPanel({
  locale,
  handle,
  verification,
  state,
  canPostScorecard,
  onHandleChange,
  onPostScorecard,
  onVerifyPost,
}: {
  locale: LocaleKey;
  handle: string;
  verification: XVerificationRecord | null;
  state: string;
  canPostScorecard: boolean;
  onHandleChange: (handle: string) => void;
  onPostScorecard: () => void;
  onVerifyPost: () => void;
}) {
  const copy = (text: string) => translate(locale, text);
  const verified = verification?.status === 'verified';
  const authUrl = '/api/x/connect';

  return (
    <section className="rail-panel x-panel">
      <p className="rail-label">{copy('X badge')}</p>
      <strong>{verified ? `@${verification.handle}` : copy('Verify public proof')}</strong>
      <span>{verified
        ? `${copy('Verified')} ${verification.name ? `· ${verification.name}` : ''}${verification.location ? ` · ${verification.location}` : ''}`
        : copy('Connect X or post a scorecard to prove the account behind a leaderboard name.')}</span>
      <label className="name-field">
        <span>{copy('X handle')}</span>
        <input value={handle ? `@${handle}` : ''} onChange={(event) => onHandleChange(event.target.value)} maxLength={16} placeholder="@handle" />
      </label>
      <div className="auth-row">
        <a className="secondary full center-link" href={authUrl}>{copy('Auth X')}</a>
        <button className="secondary full" disabled={!canPostScorecard} onClick={onPostScorecard}>{copy('Post score')}</button>
      </div>
      <button className="secondary full" disabled={!handle || !verification?.proofToken || verified} onClick={onVerifyPost}>
        {copy(verified ? 'Badge active' : 'Check post')}
      </button>
      {state ? <span className={`fine-print ${verified ? 'success' : state.toLowerCase().includes('fail') || state.toLowerCase().includes('not') ? 'error' : ''}`}>{copy(state)}</span> : null}
    </section>
  );
}

function StatusRail({
  locale,
  isPaid,
  usage,
  officialRank,
  officialHistory,
  geography,
  geoSnapshot,
  groupCode,
  groupName,
  playerName,
  usernameDraft,
  usernameState,
  reminderEmail,
  reminderState,
  inviteState,
  xHandle,
  xVerification,
  xState,
  onCreateGroup,
  onCopyInvite,
  onPlayerNameChange,
  onUsernameChange,
  onClaimUsername,
  onReminderEmailChange,
  onReminderSubmit,
  onXHandleChange,
  onXPostScorecard,
  onXVerifyPost,
  onUnlock,
}: {
  locale: LocaleKey;
  isPaid: boolean;
  usage: PlayUsage;
  officialRank: OfficialRankRecord | null;
  officialHistory: OfficialRankRecord[];
  geography: SocialBoards['geography'];
  geoSnapshot: GeoSnapshot | null;
  groupCode: string | null;
  groupName: string;
  playerName: string;
  usernameDraft: string;
  usernameState: string;
  reminderEmail: string;
  reminderState: string;
  inviteState: string;
  xHandle: string;
  xVerification: XVerificationRecord | null;
  xState: string;
  onCreateGroup: () => void | Promise<void>;
  onCopyInvite: () => void | Promise<void>;
  onPlayerNameChange: (name: string) => void;
  onUsernameChange: (name: string) => void;
  onClaimUsername: () => void;
  onReminderEmailChange: (email: string) => void;
  onReminderSubmit: () => void;
  onXHandleChange: (handle: string) => void;
  onXPostScorecard: () => void;
  onXVerifyPost: () => void;
  onUnlock: () => void;
}) {
  const copy = (text: string) => translate(locale, text);
  const stateCopy = (text: string) => text.startsWith('@') ? text : copy(text);
  const usedToday = usage.day === localDayKey() ? Math.min(DAILY_PLAY_LIMIT, usage.count) : 0;
  const remaining = Math.max(0, DAILY_PLAY_LIMIT - usedToday);
  const iqProfile = getIqProfile(officialHistory);
  const inviteCopied = inviteState === 'Link copied';

  return (
    <aside className="status-rail" aria-label="IQ WARS session and subscription">
      <GeoGlobePanel locale={locale} geography={geography} fallbackGeo={geoSnapshot} />

      <section className="rail-panel">
        <p className="rail-label">{copy('Session')}</p>
        <strong>{copy(isPaid ? 'Paid profile' : remaining > 0 ? '1 official attempt left' : '0 / 1 · used')}</strong>
        <span>{copy(isPaid ? 'Archive, reports, and extra practice are active.' : remaining > 0 ? 'One full official IQ WARS baseline today.' : 'Your official attempt is locked for today.')}</span>
        <div className="rail-rule" />
        <p className="rail-label">{copy('Official rank')}</p>
        <span className="rail-mono">{officialRank ? `${copy('Locked')} · ${officialRank.score} · ${officialRank.rank}` : copy('Not yet locked today.')}</span>
        <div className="rail-rule" />
        <p className="rail-label">{copy('Developing IQ')}</p>
        <strong>{iqProfile.score ?? copy('Unrated')}</strong>
        <span>{iqProfile.attempts > 0
          ? `${copy(iqProfile.confidence)} · ${iqProfile.attempts} ${copy('official days')} · ${copy(formatTrend(iqProfile.trend))}`
          : copy('Complete today\'s official attempt to start the profile.')}</span>
      </section>

      <section className="rail-panel friend-panel">
        <p className="rail-label">{copy('Friend room')}</p>
        <strong>{groupCode ? groupName : copy('No room yet')}</strong>
        <span>{groupCode ? `${copy('Room')} /g/${groupCode}. ${copy('Scores land on the friend board after the official run.')}` : copy('Create a room, share the link, and compete daily with one attempt each.')}</span>
        {groupCode ? (
          <>
            <label className="name-field">
              <span>{copy('Your board name')}</span>
              <input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} maxLength={32} />
            </label>
            <label className="name-field">
              <span>{copy('Claim @username')}</span>
              <input value={usernameDraft ? `@${usernameDraft}` : ''} onChange={(event) => onUsernameChange(event.target.value)} maxLength={21} placeholder="@handle" />
            </label>
            <button className="secondary full" onClick={onClaimUsername}>{stateCopy(usernameState)}</button>
            <label className="name-field">
              <span>{copy('Daily reminder')}</span>
              <input value={reminderEmail} onChange={(event) => onReminderEmailChange(event.target.value)} maxLength={120} placeholder="you@email.com" />
            </label>
            <button className="secondary full" onClick={onReminderSubmit}>{stateCopy(reminderState)}</button>
          </>
        ) : null}
        <button className={`secondary full copy-link ${inviteCopied ? 'copied' : ''}`} onClick={groupCode ? onCopyInvite : onCreateGroup}>
          {copy(groupCode ? inviteState : 'Create & copy link')}
        </button>
        {inviteCopied ? <span className="copy-confirmation" role="status" aria-live="polite">{copy('Group link copied')}</span> : null}
      </section>

      <XVerificationPanel
        locale={locale}
        handle={xHandle}
        verification={xVerification}
        state={xState}
        canPostScorecard={Boolean(officialRank && xHandle)}
        onHandleChange={onXHandleChange}
        onPostScorecard={onXPostScorecard}
        onVerifyPost={onXVerifyPost}
      />

      <section className="rail-panel unlock-panel">
        <div className="rail-price">
          <p className="rail-label">{copy('Unlock')}</p>
          <strong>{UNLIMITED_PRICE_LABEL}</strong>
        </div>
        <ul>
          <li>{copy('Full archive access')}</li>
          <li>{copy('Saved history')}</li>
          <li>{copy('Private reasoning reports')}</li>
          <li>{copy('Extra practice')}</li>
        </ul>
        <button className="secondary full" onClick={onUnlock}>{copy('Unlock profile')}</button>
      </section>
    </aside>
  );
}

function Result({
  locale,
  mode,
  answers,
  elapsedMs,
  onUnlock,
  onLeaderboard,
  groupCode,
  groupName,
}: {
  locale: LocaleKey;
  mode: ModeKey;
  answers: AnswerRecord[];
  elapsedMs: number | null;
  onUnlock: () => void;
  onLeaderboard: (entry: LeaderboardEntry, officialRank?: OfficialRankRecord) => void;
  groupCode: string | null;
  groupName: string;
}) {
  const copy = (text: string) => translate(locale, text);
  const [shareState, setShareState] = React.useState(groupCode ? 'Invite friends' : 'Share result');
  const [resultStatus, setResultStatus] = React.useState<'pending' | 'official' | 'practice' | 'daily' | 'lab'>('pending');
  const submittedRef = React.useRef(false);
  const correct = answers.filter((answer) => answer.correct).length;
  const total = answers.length;
  const percentile = percentileFromScore(correct, total);
  const speedBonus = speedBonusFromElapsed(elapsedMs, total);
  const score = worldIqScore(correct, total, elapsedMs);
  const rank = formatRank(percentile);
  const beatAi = answers.filter((answer) => answer.correct && !answer.aiSolved).length;
  const officialWorldRun = mode === 'world' && total >= 6;
  const shareText = buildShareText({ locale, mode, score, rank, percentile, correct, total, beatAi, elapsedMs, speedBonus, answers, status: resultStatus, groupCode, groupName });

  React.useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    if (!officialWorldRun) {
      setResultStatus(mode === 'daily' ? 'daily' : 'lab');
      return;
    }

    const existingOfficialRank = readOfficialRank();
    if (existingOfficialRank) {
      setResultStatus('practice');
      return;
    }

    const officialRank: OfficialRankRecord = {
      day: localDayKey(),
      score,
      rank,
      percentile,
      correct,
      total,
      beatAi,
      elapsedMs,
      speedBonus,
      timestamp: Date.now(),
    };
    writeOfficialRank(officialRank);
    saveOfficialHistory(officialRank);
    consumePlay();
    setResultStatus('official');

    const entry: LeaderboardEntry = {
      id: `official-${localDayKey()}`,
      name: 'You',
      score,
      mode: copy('Today\'s IQ WARS'),
      accuracy: `${correct}/${total}`,
      qualifier: beatAi > 0 ? `${beatAi} ${copy('AI misses')}` : copy('official daily rank'),
      timestamp: Date.now(),
      local: true,
    };
    saveLeaderboardEntry(entry);
    onLeaderboard(entry, officialRank);
  }, [beatAi, correct, elapsedMs, locale, mode, officialWorldRun, onLeaderboard, percentile, rank, score, speedBonus, total]);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: groupCode ? `${groupName} on IQ WARS` : 'IQ WARS',
          text: shareText,
          url: groupShareUrl(groupCode),
        });
        setShareState('Shared');
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareState(groupCode ? 'Invite copied' : 'Copied');
    } catch {
      setShareState('Ready');
    }
  }

  const statusCopy = resultStatus === 'official'
    ? {
      kicker: 'Official rank locked',
      title: 'Today updated your developing IQ WARS profile.',
      body: `${score} ${copy('Reasoning score')}. ${formatElapsedTime(elapsedMs)} ${copy('official time')}. ${rank} ${copy('estimated rank')}. ${beatAi} ${copy('AI misses')}.`,
    }
    : resultStatus === 'practice'
      ? {
        kicker: 'Practice result',
        title: 'Today\'s official rank is already locked.',
        body: 'Retakes are useful for training, but they do not replace the first completed IQ WARS result.',
      }
      : resultStatus === 'daily'
        ? {
          kicker: 'Daily sprint logged',
          title: 'Sprint complete.',
          body: 'Daily Sprint builds the habit. Complete Today\'s IQ WARS to update the official profile.',
        }
        : {
        kicker: 'AI lab complete',
        title: 'Blind-spot run complete.',
        body: `${beatAi} ${copy('answers landed on puzzles current model baselines often miss.')}`,
      };

  return (
    <div className="runner-panel result">
      <p className="kicker">{copy(statusCopy.kicker)}</p>
      <div className="result-top">
        <div>
          <strong className="score">{score}</strong>
          <span>{copy('Reasoning score')}</span>
        </div>
        <div className="rank-card">
          <strong>{rank}</strong>
          <span>{copy('estimated rank')}</span>
        </div>
      </div>
      <div className="stats three">
        <div><strong>{correct}/{total}</strong><span>{copy('correct')}</span></div>
        <div><strong>{formatElapsedTime(elapsedMs)}</strong><span>{copy('official time')}</span></div>
        <div><strong>+{speedBonus}</strong><span>{copy('speed bonus')}</span></div>
      </div>
      <div className="share-card">
        <div>
          <strong>{mode === 'world' ? `IQ WARS ${localDayKey()}` : copy(modes[mode].label)}</strong>
          <span>{correct}/{total} {copy('correct')} · {beatAi} {copy('AI misses')}</span>
        </div>
        <div className="share-pattern" aria-label="Result pattern" style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}>
          {answers.map((answer) => (
            <span key={answer.id} className={answer.correct ? 'hit' : 'miss'} />
          ))}
        </div>
        <p>{shareText}</p>
      </div>
      <div className={`qualification ${resultStatus === 'official' ? 'qualified' : ''}`}>
        <strong>{copy(statusCopy.title)}</strong>
        <span>{copy(statusCopy.body)}</span>
      </div>
      <p className="trust-note">{copy('IQ WARS is a competitive visual reasoning game, not a clinical IQ test, admission test, or supervised psychometric assessment.')}</p>
      <div className="actions">
        <button className="primary" onClick={share}>{copy(shareState)}</button>
        <button className="secondary" onClick={onUnlock}>{copy('Save rank')}</button>
        <button className="secondary" onClick={onUnlock}>{copy('Unlock archive')}</button>
      </div>
    </div>
  );
}

function Runner({
  locale,
  mode,
  startRequest,
  isPaid,
  onUnlock,
  onLeaderboard,
  onUsageChange,
  groupCode,
  groupName,
}: {
  locale: LocaleKey;
  mode: ModeKey;
  startRequest: number;
  isPaid: boolean;
  onUnlock: () => void;
  onLeaderboard: (entry: LeaderboardEntry, officialRank?: OfficialRankRecord) => void;
  onUsageChange: (usage: PlayUsage) => void;
  groupCode: string | null;
  groupName: string;
}) {
  const copy = (text: string) => translate(locale, text);
  const [started, setStarted] = React.useState(() => isPaid || playsRemaining(readPlayUsage()) > 0);
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [answers, setAnswers] = React.useState<AnswerRecord[]>([]);
  const [playUsage, setPlayUsage] = React.useState<PlayUsage>(() => readPlayUsage());
  const [timerStartedAt, setTimerStartedAt] = React.useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [completedElapsedMs, setCompletedElapsedMs] = React.useState<number | null>(null);
  const questions = React.useMemo(() => getQuestions(mode), [mode]);
  const complete = started && step >= questions.length;
  const current = complete ? questions[questions.length - 1] : questions[step];
  const remainingToday = playsRemaining(playUsage);
  const liveScore = liveIqScoreProjection(answers, questions.length, elapsedMs);
  const liveDelta = liveScore - 100;

  React.useEffect(() => {
    const usage = readPlayUsage();
    setPlayUsage(usage);
    onUsageChange(usage);
    setStarted(isPaid || playsRemaining(usage) > 0);
  }, [isPaid, onUsageChange]);
  React.useEffect(() => {
    const usage = readPlayUsage();
    setPlayUsage(usage);
    onUsageChange(usage);
    setStarted(isPaid || playsRemaining(usage) > 0);
    setStep(0);
    setSelected(null);
    setAnswers([]);
    setTimerStartedAt(Date.now());
    setElapsedMs(0);
    setCompletedElapsedMs(null);
  }, [isPaid, mode, onUsageChange]);

  React.useEffect(() => {
    if (!started || complete) return undefined;
    const tick = () => setElapsedMs(Date.now() - timerStartedAt);
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [complete, started, timerStartedAt]);

  function begin() {
    const usage = readPlayUsage();
    setPlayUsage(usage);
    if (!isPaid && playsRemaining(usage) <= 0) {
      onUnlock();
      return;
    }
    setStarted(true);
    setStep(0);
    setSelected(null);
    setAnswers([]);
    setTimerStartedAt(Date.now());
    setElapsedMs(0);
    setCompletedElapsedMs(null);
  }

  React.useEffect(() => {
    if (startRequest > 0) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  function lockAnswer() {
    if (selected === null || complete || !current) return;
    const finalElapsed = Date.now() - timerStartedAt;
    setAnswers((existing) => [...existing, {
      id: current.id,
      selected,
      correct: selected === current.answerIndex,
      aiSolved: current.aiSolved,
    }]);
    setSelected(null);
    if (step + 1 >= questions.length) {
      setElapsedMs(finalElapsed);
      setCompletedElapsedMs(finalElapsed);
    }
    setStep((value) => value + 1);
  }

  if (!isPaid && !started) {
    return (
      <div className="runner-panel gate">
        <p className="kicker">{copy(modes[mode].label)}</p>
        <h2>{copy('Your one official attempt today is locked.')}</h2>
        <p className="free-note">{copy('Free players get one full official IQ WARS run per day. Unlock a paid profile for archive access, private reports, and extra practice, or come back tomorrow.')}</p>
        <button className="primary full" onClick={onUnlock}>{copy('Unlock profile')}</button>
      </div>
    );
  }

  if (complete) return <Result locale={locale} mode={mode} answers={answers} elapsedMs={completedElapsedMs ?? elapsedMs} onUnlock={onUnlock} onLeaderboard={onLeaderboard} groupCode={groupCode} groupName={groupName} />;

  return (
    <div className="runner-panel">
      <div className="progress-row">
        <p className="kicker">{copy(modes[mode].label)}</p>
        <span>{String(step + 1).padStart(3, '0')} / {String(questions.length).padStart(2, '0')} · {formatElapsedTime(elapsedMs)} · {copy(isPaid ? 'Paid profile' : remainingToday > 0 ? '1 / 1 left' : '0 / 1 used')}</span>
      </div>
      <div className="live-score-row" aria-live="polite">
        <div>
          <span>{copy('Live score')}</span>
          <strong>{liveScore}</strong>
        </div>
        <div>
          <span>{copy('Answered')}</span>
          <strong>{answers.length}/{questions.length}</strong>
        </div>
        <div>
          <span>{copy('Trajectory')}</span>
          <strong>{liveDelta > 0 ? `+${liveDelta}` : liveDelta}</strong>
        </div>
      </div>
      <div className="track"><div style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      <div className="question-head">
        <h2>{copy(current.title)}</h2>
        <span>{copy(current.difficulty)}</span>
      </div>
      <p className="prompt">{copy(current.prompt)}</p>
      <div className="matrix">
        {current.matrix.map((item, index) => <PatternTileView key={`${current.id}-${index}`} tile={item} />)}
      </div>
      <div className="options">
        {current.options.map((item, index) => (
          <button key={`${current.id}-${index}`} aria-label={`${copy('Answer')} ${index + 1}`} className={`option ${selected === index ? 'active' : ''}`} onClick={() => setSelected(index)}>
            <PatternTileView tile={item} selected={selected === index} />
            <span>{String.fromCharCode(65 + index)}</span>
          </button>
        ))}
      </div>
      <div className="answer-footer">
        <p>{copy(current.aiSolved ? 'Frontier models usually solve this.' : 'Frontier models often miss this pattern.')} {copy('Score updates after each lock.')}</p>
        <button className="primary" disabled={selected === null} onClick={lockAnswer}>{copy('Lock answer')}</button>
      </div>
    </div>
  );
}

export default function Home({ initialGroupCode = '' }: { initialGroupCode?: string }) {
  const [mode, setMode] = React.useState<ModeKey>('world');
  const [view, setView] = React.useState<ViewKey>('test');
  const [locale, setLocale] = React.useState<LocaleKey>('en');
  const playInteractionSound = useInteractionSoundLayer();
  const startRequest = 0;
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>(seededLeaderboard);
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [paidAccess, setPaidAccess] = React.useState(false);
  const [checkoutState, setCheckoutState] = React.useState<'idle' | 'opening' | 'verifying' | 'active' | 'error'>('idle');
  const [checkoutError, setCheckoutError] = React.useState('');
  const [usageSnapshot, setUsageSnapshot] = React.useState<PlayUsage>(() => blankPlayUsage());
  const [officialSnapshot, setOfficialSnapshot] = React.useState<OfficialRankRecord | null>(null);
  const [officialHistory, setOfficialHistory] = React.useState<OfficialRankRecord[]>([]);
  const initialRouteGroupCode = cleanGroupCode(initialGroupCode);
  const [groupCode, setGroupCode] = React.useState<string>(initialRouteGroupCode);
  const [groupName, setGroupName] = React.useState<string>(() => initialRouteGroupCode ? groupNameFromCode(initialRouteGroupCode) : '');
  const [playerId, setPlayerId] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [usernameDraft, setUsernameDraft] = React.useState('');
  const [claimedUsername, setClaimedUsername] = React.useState('');
  const [usernameState, setUsernameState] = React.useState('Claim handle');
  const [reminderEmail, setReminderEmail] = React.useState('');
  const [reminderState, setReminderState] = React.useState('Remind me tomorrow');
  const [inviteState, setInviteState] = React.useState('Copy link');
  const [recursivAccount, setRecursivAccount] = React.useState<RecursivAccountRecord | null>(null);
  const [authEmail, setAuthEmail] = React.useState('');
  const [authCode, setAuthCode] = React.useState('');
  const [authState, setAuthState] = React.useState<'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error'>('idle');
  const [authMessage, setAuthMessage] = React.useState('');
  const [xHandle, setXHandle] = React.useState('');
  const [xVerification, setXVerification] = React.useState<XVerificationRecord | null>(null);
  const [xState, setXState] = React.useState('');
  const [geoSnapshot, setGeoSnapshot] = React.useState<GeoSnapshot | null>(null);
  const [socialBoards, setSocialBoards] = React.useState<SocialBoards>({ global: [], group: [], geography: EMPTY_GEOGRAPHY_BOARDS });
  const copy = React.useCallback((text: string) => translate(locale, text), [locale]);

  React.useEffect(() => {
    const detected = detectBrowserLocale();
    setLocale(detected);
    document.documentElement.lang = detected;
    document.documentElement.dataset.locale = detected;
  }, []);

  React.useEffect(() => {
    const id = readPlayerId();
    const code = readStoredGroupCode(initialGroupCode);
    const name = readStoredGroupName(code);
    setLeaderboard(getLeaderboardEntries());
    setPaidAccess(false);
    setUsageSnapshot(readPlayUsage());
    setOfficialSnapshot(readOfficialRank());
    setOfficialHistory(readOfficialHistory());
    setPlayerId(id);
    setPlayerName(readPlayerName(id));
    const username = readClaimedUsername();
    setClaimedUsername(username);
    setUsernameDraft(username);
    setUsernameState(username ? `@${username} claimed` : 'Claim handle');
    setReminderEmail(readReminderEmail());
    const account = readRecursivAccount();
    setRecursivAccount(account);
    setAuthEmail(account?.email || '');
    const xRecord = readXVerification();
    setXVerification(xRecord);
    setXHandle(xRecord?.handle || '');
    setXState(xRecord?.status === 'verified' ? 'X badge active' : xRecord?.proofToken ? 'Post pending verification' : '');
    setGroupCode(code);
    setGroupName(name);
    if (code) writeStoredGroup(code, name);
  }, [initialGroupCode]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const status = params.get('x_status');
    const verified = params.get('x_verified') === '1';
    const handle = cleanXHandle(params.get('x_handle'));
    const name = params.get('x_name');
    const location = params.get('x_location');
    const followers = Number(params.get('x_followers'));

    if (verified && handle) {
      const record: XVerificationRecord = {
        handle,
        status: 'verified',
        method: 'oauth',
        proofToken: null,
        name: name?.trim() || null,
        location: location?.trim() || null,
        followers: Number.isFinite(followers) ? followers : null,
        updatedAt: Date.now(),
      };
      writeXVerification(record);
      setXVerification(record);
      setXHandle(handle);
      setXState('X badge active');
      const xGeo = geoFromXLocation(record.location);
      if (xGeo) setGeoSnapshot((current) => current?.source === 'x_profile' ? current : xGeo);
    } else if (status) {
      setXState(status === 'not_configured' ? 'X auth is not configured yet' : status === 'cancelled' ? 'X auth cancelled' : 'X auth failed');
    }

    if (verified || status) {
      ['x_verified', 'x_handle', 'x_name', 'x_location', 'x_followers', 'x_status'].forEach((key) => params.delete(key));
      window.history.replaceState({}, '', `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}${url.hash}`);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function detectGeo() {
      const fallback = fallbackGeoSnapshot();
      if (fallback) setGeoSnapshot(fallback);
      try {
        const params = new URLSearchParams();
        if (fallback?.timeZone) params.set('tz', fallback.timeZone);
        if (typeof navigator !== 'undefined' && navigator.language) params.set('locale', navigator.language);
        const response = await fetch(`/api/geo?${params.toString()}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        const detected = normalizeGeoSnapshot(data) || fallback;
        if (!cancelled && detected) setGeoSnapshot(detected);
      } catch {
        if (!cancelled && fallback) setGeoSnapshot(fallback);
      }
    }

    void detectGeo();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSocialBoards = React.useCallback(async (code: string | null) => {
    try {
      const params = new URLSearchParams({ day: localDayKey() });
      if (code) params.set('group', code);
      const response = await fetch(`/api/leaderboards?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (response.ok && Array.isArray(data?.global)) {
        setSocialBoards({
          global: data.global,
          group: Array.isArray(data.group) ? data.group : [],
          geography: data.geography && typeof data.geography === 'object' ? {
            countries: Array.isArray(data.geography.countries) ? data.geography.countries : [],
            cities: Array.isArray(data.geography.cities) ? data.geography.cities : [],
            towns: Array.isArray(data.geography.towns) ? data.geography.towns : [],
          } : EMPTY_GEOGRAPHY_BOARDS,
        });
      }
    } catch {
      // Friend boards are additive; the test still works if the social endpoint is unavailable.
    }
  }, []);

  React.useEffect(() => {
    refreshSocialBoards(groupCode || null);
  }, [groupCode, refreshSocialBoards]);

  React.useEffect(() => {
    let cancelled = false;

    async function refreshAccess() {
      try {
        const response = await fetch('/api/access', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok) {
          setPaidAccess(Boolean(data?.active));
        }
      } catch {
        // Local saved access still keeps the player moving if the read endpoint is unavailable.
      }
    }

    refreshAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sub = params.get('sub');
    const tier = params.get('tier') || 'plus';

    async function verifyCheckout() {
      setUnlockOpen(true);
      setCheckoutState('verifying');
      setCheckoutError('');
      try {
        const response = await fetch(`/api/checkout-status?tier=${encodeURIComponent(tier)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.active) {
          throw new Error(data?.error || 'Payment could not be verified yet.');
        }
        setPaidAccess(true);
        setCheckoutState('active');
      } catch (error) {
        setCheckoutState('error');
        setCheckoutError(error instanceof Error ? error.message : 'Payment is processing. Refresh in a moment.');
      } finally {
        clearCheckoutQuery();
      }
    }

    if (sub === 'success') {
      verifyCheckout();
      return;
    }

    if (sub === 'cancelled' || checkout === 'cancelled') {
      setUnlockOpen(true);
      setCheckoutState('idle');
      setCheckoutError('Checkout was cancelled. You can restart it when ready.');
      clearCheckoutQuery();
    }
  }, []);

  function openMode(nextMode: ModeKey) {
    setMode(nextMode);
    setView('test');
  }

  const handleInteractionPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('button, a, input');
    if (!action) return;
    if (action instanceof HTMLButtonElement && action.disabled) return;
    if (action.closest('.option')) {
      playInteractionSound('select');
      return;
    }
    if (action.closest('.copy-link')) {
      playInteractionSound('copy');
      return;
    }
    if (action.classList.contains('primary')) {
      playInteractionSound('commit');
      return;
    }
    playInteractionSound('tap');
  }, [playInteractionSound]);

  async function submitOfficialResult(record: OfficialRankRecord) {
    const id = playerId || readPlayerId();
    const username = claimedUsername || readClaimedUsername();
    const displayName = (username ? `@${username}` : playerName || readPlayerName(id)).trim();
    try {
      const response = await fetch('/api/leaderboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: record.day,
          playerId: id,
          displayName,
          username,
          groupCode: groupCode || null,
          groupName: groupCode ? groupName : null,
          score: record.score,
          rank: record.rank,
          percentile: record.percentile,
          correct: record.correct,
          total: record.total,
          beatAi: record.beatAi,
          elapsedMs: record.elapsedMs ?? null,
          speedBonus: record.speedBonus ?? null,
          geo: geoSnapshot || fallbackGeoSnapshot(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && Array.isArray(data?.global)) {
        setSocialBoards({
          global: data.global,
          group: Array.isArray(data.group) ? data.group : [],
          geography: data.geography && typeof data.geography === 'object' ? {
            countries: Array.isArray(data.geography.countries) ? data.geography.countries : [],
            cities: Array.isArray(data.geography.cities) ? data.geography.cities : [],
            towns: Array.isArray(data.geography.towns) ? data.geography.towns : [],
          } : EMPTY_GEOGRAPHY_BOARDS,
        });
      }
    } catch {
      // The local official result remains saved even if the social board cannot sync.
    }
  }

  function handleLeaderboard(_entry?: LeaderboardEntry, officialRank?: OfficialRankRecord) {
    setLeaderboard(getLeaderboardEntries());
    setOfficialSnapshot(readOfficialRank());
    setOfficialHistory(readOfficialHistory());
    setUsageSnapshot(readPlayUsage());
    if (officialRank) void submitOfficialResult(officialRank);
  }

  const handleUsageChange = React.useCallback((usage: PlayUsage) => {
    setUsageSnapshot(usage);
  }, []);

  function handlePlayerNameChange(name: string) {
    const next = name.slice(0, 32);
    setPlayerName(next);
    writePlayerName(next);
  }

  function handleUsernameChange(value: string) {
    const next = cleanUsernameInput(value);
    setUsernameDraft(next);
    setUsernameState(next && next === claimedUsername ? `@${next} claimed` : 'Claim handle');
  }

  async function claimUsername() {
    const username = cleanUsernameInput(usernameDraft);
    if (username.length < 3) {
      setUsernameState('3+ chars');
      return;
    }
    const id = playerId || readPlayerId();
    setUsernameState('Claiming');
    try {
      const response = await fetch('/api/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, playerId: id, displayName: playerName || `@${username}` }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setUsernameState(data?.error || 'Taken');
        return;
      }
      setClaimedUsername(username);
      setUsernameDraft(username);
      writeClaimedUsername(username);
      setUsernameState(`@${username} claimed`);
      void refreshSocialBoards(groupCode || null);
    } catch {
      setUsernameState('Try again');
    }
  }

  function handleReminderEmailChange(email: string) {
    const next = email.slice(0, 120);
    setReminderEmail(next);
    writeReminderEmail(next);
    setReminderState('Remind me tomorrow');
  }

  async function submitReminder() {
    const email = reminderEmail.trim();
    if (!email.includes('@')) {
      setReminderState('Add email');
      return;
    }
    setReminderState('Saving');
    try {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          playerId: playerId || readPlayerId(),
          groupCode: groupCode || null,
          groupName: groupCode ? groupName : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setReminderState(data?.error || 'Try again');
        return;
      }
      writeReminderEmail(email);
      setReminderState(data?.confirmationSent ? 'Email sent' : 'Reminder saved');
    } catch {
      setReminderState('Try again');
    }
  }

  function handleXHandleChange(value: string) {
    const next = cleanXHandle(value);
    setXHandle(next);
    if (!next) {
      setXState('');
      return;
    }
    if (xVerification?.handle && cleanXHandle(xVerification.handle).toLowerCase() === next.toLowerCase()) {
      setXState(xVerification.status === 'verified' ? 'X badge active' : 'Post pending verification');
      return;
    }
    setXState('Post a scorecard or auth X');
  }

  function postXScorecard() {
    if (!officialSnapshot) {
      setXState('Lock today\'s score first');
      playInteractionSound('error');
      return;
    }
    const handle = cleanXHandle(xHandle);
    if (!handle) {
      setXState('Add X handle');
      playInteractionSound('error');
      return;
    }
    const scorecard = buildXScorecardText(officialSnapshot, groupCode || null, groupName, playerId || readPlayerId());
    const record: XVerificationRecord = {
      handle,
      status: 'pending_post',
      method: 'post',
      proofToken: scorecard.token,
      updatedAt: Date.now(),
    };
    writeXVerification(record);
    setXVerification(record);
    setXState('Post opened. Return and check.');
    playInteractionSound('copy');
    if (typeof window !== 'undefined') {
      window.open(xIntentUrl(scorecard.text), '_blank', 'noopener,noreferrer');
    }
  }

  async function verifyXPost() {
    const handle = cleanXHandle(xHandle || xVerification?.handle);
    const token = xVerification?.proofToken;
    if (!handle || !token) {
      setXState('Post score first');
      playInteractionSound('error');
      return;
    }
    setXState('Checking X');
    try {
      const response = await fetch('/api/x/verify-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, token }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.verified) {
        throw new Error(data?.error || 'Post not found yet');
      }
      const record: XVerificationRecord = {
        handle,
        status: 'verified',
        method: 'post',
        proofToken: token,
        name: typeof data.profile?.name === 'string' ? data.profile.name : null,
        location: typeof data.profile?.location === 'string' ? data.profile.location : null,
        followers: typeof data.profile?.followers === 'number' ? data.profile.followers : null,
        updatedAt: Date.now(),
      };
      writeXVerification(record);
      setXVerification(record);
      setXHandle(handle);
      setXState('X badge active');
      const xGeo = geoFromXLocation(record.location);
      if (xGeo) setGeoSnapshot((current) => current?.source === 'x_profile' ? current : xGeo);
      playInteractionSound('success');
    } catch (error) {
      setXState(error instanceof Error ? error.message : 'X check failed');
      playInteractionSound('error');
    }
  }

  const resetInviteStateSoon = React.useCallback((state: string) => {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      setInviteState((current) => current === state ? 'Copy link' : current);
    }, 1800);
  }, []);

  const copyGroupLink = React.useCallback(async (code: string) => {
    const url = groupShareUrl(code);
    setInviteState('Copying link');
    try {
      await copyTextToClipboard(url);
      setInviteState('Link copied');
      playInteractionSound('success');
      resetInviteStateSoon('Link copied');
    } catch {
      setInviteState('Copy failed');
      playInteractionSound('error');
      resetInviteStateSoon('Copy failed');
    }
  }, [playInteractionSound, resetInviteStateSoon]);

  async function createGroup() {
    const code = randomRoomCode();
    const name = groupNameFromCode(code);
    setGroupCode(code);
    setGroupName(name);
    setInviteState('Copying link');
    writeStoredGroup(code, name);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `/g/${code}`);
    }
    void refreshSocialBoards(code);
    await copyGroupLink(code);
  }

  async function copyInvite() {
    if (!groupCode) {
      await createGroup();
      return;
    }
    await copyGroupLink(groupCode);
  }

  async function sendRecursivAuthCode() {
    const email = authEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setAuthState('error');
      setAuthMessage('Enter a valid email.');
      return;
    }
    setAuthState('sending');
    setAuthMessage('');
    try {
      const response = await fetch('/api/recursiv-auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Could not send code.');
      }
      setAuthEmail(email);
      setAuthState('sent');
      setAuthMessage(data?.branded ? 'IQ WARS code sent.' : 'Code sent.');
    } catch (error) {
      setAuthState('error');
      setAuthMessage(error instanceof Error ? error.message : 'Could not send code.');
    }
  }

  async function verifyRecursivAuthCode() {
    const email = authEmail.trim().toLowerCase();
    const code = authCode.trim();
    if (!email.includes('@') || code.length < 4) {
      setAuthState('error');
      setAuthMessage('Enter the email and code.');
      return;
    }
    setAuthState('verifying');
    setAuthMessage('');
    try {
      const response = await fetch('/api/recursiv-auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Code could not be verified.');
      }
      if (!data?.projectMember) {
        throw new Error('IQ WARS project membership is not configured yet.');
      }
      const account = { email, name: data?.user?.name || null };
      writeRecursivAccount(account);
      setRecursivAccount({ ...account, updatedAt: Date.now() });
      setAuthState('verified');
      setAuthMessage('IQ WARS account connected.');
    } catch (error) {
      setAuthState('error');
      setAuthMessage(error instanceof Error ? error.message : 'Code could not be verified.');
    }
  }

  const checkoutBusy = checkoutState === 'opening' || checkoutState === 'verifying';

  async function startCheckout() {
    if (checkoutBusy) return;
    if (!recursivAccount) {
      setCheckoutState('error');
      setCheckoutError('Create an IQ WARS account before checkout.');
      setAuthMessage('Create an IQ WARS account before checkout.');
      return;
    }
    setCheckoutState('opening');
    setCheckoutError('');
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.url !== 'string') {
        throw new Error(data?.error || 'Could not open Recursiv checkout.');
      }
      window.location.assign(data.url);
    } catch (error) {
      setCheckoutState('error');
      setCheckoutError(error instanceof Error ? error.message : 'Could not open Recursiv checkout.');
    }
  }

  return (
    <main lang={locale} data-locale={locale} onPointerDownCapture={handleInteractionPointerDown}>
      <nav>
        <button className="brand" onClick={() => {
          setMode('world');
          setView('test');
        }}>
          <strong>IQ WARS</strong>
        </button>
        <div>
          <span className="language-pill" aria-label={`${copy('Auto')} ${localeLabel(locale)}`}>{copy('Auto')} · {localeLabel(locale)}</span>
          <button className={view === 'test' && mode === 'world' ? 'active' : ''} onClick={() => openMode('world')}>{copy('Today')}</button>
          <button className={view === 'rankings' ? 'active' : ''} onClick={() => setView('rankings')}>{copy('Rankings')}</button>
          <button className={view === 'about' ? 'active' : ''} onClick={() => setView('about')}>{copy('About')}</button>
          <button className="nav-cta" onClick={() => setUnlockOpen(true)}>{copy('Account')}</button>
        </div>
      </nav>

      {view === 'test' ? (
        <section className="test-surface" aria-label={`${copy(modes[mode].label)} test`}>
          <SignalSculpture />
          <Runner key={mode} locale={locale} mode={mode} startRequest={startRequest} isPaid={paidAccess} onUnlock={() => setUnlockOpen(true)} onLeaderboard={handleLeaderboard} onUsageChange={handleUsageChange} groupCode={groupCode || null} groupName={groupName} />
          <StatusRail
            locale={locale}
            isPaid={paidAccess}
            usage={usageSnapshot}
            officialRank={officialSnapshot}
            officialHistory={officialHistory}
            geography={socialBoards.geography}
            geoSnapshot={geoSnapshot}
            groupCode={groupCode || null}
            groupName={groupName}
            playerName={playerName}
            usernameDraft={usernameDraft}
            usernameState={usernameState}
            reminderEmail={reminderEmail}
            reminderState={reminderState}
            inviteState={inviteState}
            xHandle={xHandle}
            xVerification={xVerification}
            xState={xState}
            onCreateGroup={createGroup}
            onCopyInvite={copyInvite}
            onPlayerNameChange={handlePlayerNameChange}
            onUsernameChange={handleUsernameChange}
            onClaimUsername={claimUsername}
            onReminderEmailChange={handleReminderEmailChange}
            onReminderSubmit={submitReminder}
            onXHandleChange={handleXHandleChange}
            onXPostScorecard={postXScorecard}
            onXVerifyPost={verifyXPost}
            onUnlock={() => setUnlockOpen(true)}
          />
        </section>
      ) : null}

      {view === 'rankings' ? (
        <>
          <IqProfilePanel history={officialHistory} onUnlock={() => setUnlockOpen(true)} locale={locale} />
          <SocialLeaderboard
            locale={locale}
            kicker={copy('Friend room')}
            title={groupCode ? `${groupName} ${copy('daily board')}` : copy('Create a private daily board.')}
            description={groupCode ? copy('One invite link. One official attempt each. The room resets daily and keeps the pressure local.') : copy('Friend rooms are the fastest loop: create a link, send it to a group chat, and compare official scores today.')}
            entries={socialBoards.group}
            empty={copy(groupCode ? 'No friends have locked today.' : 'No friend room yet.')}
            cta={copy(groupCode ? inviteState : 'Create & copy link')}
            onCta={groupCode ? copyInvite : createGroup}
          />
          <SocialLeaderboard
            locale={locale}
            kicker={copy('Global board')}
            title={copy('The daily global IQ WARS board.')}
            description={copy('The highest official first attempts today, deduped by player. Friend-room results also qualify globally.')}
            entries={socialBoards.global}
            empty={copy('No global results yet today.')}
            cta={copy(groupCode ? inviteState : 'Create & copy link')}
            onCta={groupCode ? copyInvite : createGroup}
          />
          <GeographyLeaderboard locale={locale} geography={socialBoards.geography} />
        </>
      ) : null}

      {view === 'about' ? (
        <section className="features">
          <div className="section-head">
            <div>
              <p className="kicker">{copy('IQ WARS by Recursiv')}</p>
              <h2>{copy('The daily reasoning rank for humans and AI.')}</h2>
              <p>{copy('One full baseline test on day one, then one official attempt per day as the profile gets sharper.')}</p>
            </div>
          </div>
          <div className="feature-grid">
            <article><strong>{copy('Full baseline')}</strong><p>{copy('First visit starts with the full 12-question run. Better signal, cleaner leaderboard, no disposable teaser score.')}</p></article>
            <article><strong>{copy('Daily rank')}</strong><p>{copy('One official attempt per day keeps the board clean and lets the IQ profile develop over time.')}</p></article>
            <article><strong>{copy('Friend rooms')}</strong><p>{copy('Copy one link, bring a group chat, and compare official scores on the same daily board.')}</p></article>
          </div>
          <div className="monetization">
            <div><strong>{copy('IQ WARS Unlimited')}</strong><p>{copy('Free players get 1 official attempt per day. Paid profiles unlock archive access, saved history, private reasoning reports, and extra hard practice.')}</p></div>
            <button className="secondary" onClick={() => setUnlockOpen(true)}>{copy('Save profile')}</button>
          </div>
          <p className="trust-note">{copy('IQ WARS is not a clinical IQ test, admission test, or supervised psychometric assessment.')}</p>
        </section>
      ) : null}

      {unlockOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy('Unlock IQ WARS archive access')}>
          <div className="modal">
            <button className="close" onClick={() => setUnlockOpen(false)} aria-label={copy('Close')}>×</button>
            <p className="kicker">{copy('IQ WARS account')}</p>
            <h2>{copy(paidAccess ? 'Unlimited is active.' : 'Create an account, then unlock the archive.')}</h2>
            <p>{paidAccess
              ? copy('Your paid IQ WARS access is active on this device. Keep building history, practicing, and saving rank cards.')
              : recursivAccount
                ? `${copy('Connected as')} ${recursivAccount.email}. ${copy('Continue to Recursiv checkout for archive access, score history, and private reports.')}`
                : copy('Free visitors get 1 official attempt per day. Create an IQ WARS account with a branded email code, then continue to Recursiv checkout for archive access, score history, and private reports.')}</p>
            <div className="plans">
              <div><strong>{copy('Free')}</strong><span>{copy('1 official attempt / day')}</span></div>
              <div><strong>{UNLIMITED_PRICE_LABEL}</strong><span>{copy('archive + reports + extra practice')}</span></div>
            </div>
            {paidAccess ? (
              <button className="primary full" onClick={() => setUnlockOpen(false)}>{copy('Continue playing')}</button>
            ) : (
              <div className="stacked-actions">
                <div className="auth-card" aria-label={copy('IQ WARS signup options')}>
                  <label className="name-field">
                    <span>{copy('IQ WARS email')}</span>
                    <input value={authEmail} onChange={(event) => {
                      setAuthEmail(event.target.value);
                      setAuthMessage('');
                      if (authState === 'error') setAuthState('idle');
                    }} maxLength={120} placeholder="you@email.com" inputMode="email" />
                  </label>
                  <div className="auth-row">
                    <button className="secondary full" disabled={authState === 'sending'} onClick={sendRecursivAuthCode}>
                      {copy(authState === 'sending' ? 'Sending code' : authState === 'sent' ? 'Send again' : 'Email me a code')}
                    </button>
                    <a className="secondary full center-link google-auth" href={RECURSIV_GOOGLE_SIGNUP_URL}>
                      <span className="google-mark" aria-hidden="true">G</span>
                      {copy('Google via Recursiv')}
                    </a>
                  </div>
                  <label className="name-field">
                    <span>{copy('Verification code')}</span>
                    <input value={authCode} onChange={(event) => {
                      setAuthCode(event.target.value.replace(/\D+/g, '').slice(0, 8));
                      setAuthMessage('');
                      if (authState === 'error') setAuthState('sent');
                    }} maxLength={8} placeholder="000000" inputMode="numeric" />
                  </label>
                  <button className="secondary full" disabled={authState === 'verifying'} onClick={verifyRecursivAuthCode}>
                    {copy(authState === 'verifying' ? 'Verifying code' : recursivAccount ? 'Account connected' : 'Verify IQ WARS account')}
                  </button>
                  {authMessage ? <span className={`fine-print ${authState === 'error' ? 'error' : authState === 'verified' ? 'success' : ''}`}>{copy(authMessage)}</span> : null}
                </div>
                <button className="primary full" disabled={checkoutBusy} onClick={startCheckout}>
                  {copy(checkoutState === 'opening' ? 'Opening checkout' : checkoutState === 'verifying' ? 'Verifying payment' : 'Continue to checkout')}
                </button>
              </div>
            )}
            <span className="fine-print">
              {paidAccess
                ? copy('Archive access and extra practice are enabled.')
                : `${copy('Games-style pricing at')} ${UNLIMITED_PRICE_LABEL}. ${copy('Checkout is created securely by Recursiv.')}`}
            </span>
            {checkoutError ? <span className="fine-print error">{copy(checkoutError)}</span> : null}
            {checkoutState === 'active' ? <span className="fine-print success">{copy('Payment verified. Unlimited is active.')}</span> : null}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        :root {
          color-scheme: light;
          --bg: #747573;
          --stage: #e4e4e1;
          --stage-deep: #c8c8c4;
          --ink: #111111;
          --muted: #575b5d;
          --faint: #878b8d;
          --line: rgba(17,17,17,.16);
          --line-strong: rgba(17,17,17,.32);
          --panel: rgba(242,242,237,.48);
          --soft: rgba(255,255,250,.34);
          --accent: #9b916f;
          --accent-soft: rgba(155,145,111,.14);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background:
            radial-gradient(circle at 52% -10%, rgba(255,255,255,.42), transparent 34%),
            linear-gradient(135deg, #656762, #8a8b86 44%, #70716c);
          color: var(--ink);
          font-family: "Helvetica Neue", Helvetica, Arial, ui-sans-serif, sans-serif;
        }
        button, a { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .38; }
        main {
          width: min(1180px, calc(100vw - 44px));
          min-height: calc(100vh - 64px);
          margin: 32px auto;
          padding: 18px 20px 24px;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.26);
          border-radius: 34px;
          background:
            linear-gradient(145deg, rgba(255,255,255,.55), transparent 28%),
            linear-gradient(125deg, #efefea 0%, var(--stage) 48%, var(--stage-deep) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.62),
            inset 0 -22px 60px rgba(0,0,0,.09),
            0 38px 110px rgba(0,0,0,.34);
        }
        main::before {
          content: "";
          position: absolute;
          inset: 18px;
          border: 1px solid rgba(17,17,17,.1);
          border-radius: 24px;
          pointer-events: none;
        }
        nav {
          max-width: none;
          margin: 0 auto;
          padding: 6px 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          position: relative;
          z-index: 3;
        }
        .brand { border: 0; background: transparent; color: var(--ink); display: grid; gap: 1px; padding: 0; text-align: left; }
        nav strong { font-family: "Courier New", ui-monospace, monospace; font-size: 26px; line-height: 1; letter-spacing: .02em; text-transform: uppercase; }
        nav span { color: var(--faint); font-family: "Courier New", ui-monospace, monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
        nav > div:last-child { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        nav button {
          border: 0;
          background: transparent;
          color: #1d1f20;
          padding: 8px 9px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .01em;
          text-transform: lowercase;
          border-radius: 0;
        }
        nav .brand { padding: 0; color: var(--ink); border-radius: 0; }
        nav .nav-cta { min-height: 36px; padding: 7px 12px; }
        .language-pill {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 8px;
          border: 1px solid var(--line);
          color: var(--muted);
          font-family: "Courier New", ui-monospace, monospace;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        nav button:not(.brand)::after { content: " ↗"; font-size: 12px; }
        nav button.active { color: var(--ink); background: transparent; box-shadow: inset 0 -1px 0 var(--ink); }
        .nav-cta, .secondary {
          border: 1px solid var(--line-strong);
          background: rgba(255,255,255,.18);
          color: var(--ink);
          border-radius: 999px;
          min-height: 44px;
          padding: 10px 18px;
          font-weight: 800;
          letter-spacing: .02em;
          text-transform: uppercase;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.36);
        }
        .secondary.copied {
          border-color: rgba(36,79,55,.42);
          color: #244f37;
          background: rgba(36,79,55,.08);
        }
        .copy-confirmation {
          display: block;
          margin-top: -4px;
          color: #244f37;
          font-family: "Courier New", ui-monospace, monospace;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
          text-align: center;
        }
        .primary {
          border: 1px solid var(--ink);
          background: var(--ink);
          color: #f6f6ef;
          border-radius: 999px;
          min-height: 44px;
          padding: 11px 20px;
          font-weight: 800;
          letter-spacing: .03em;
          text-transform: uppercase;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 16px 34px rgba(0,0,0,.22);
        }
        .full { width: 100%; }
        .center-link { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
        .test-surface {
          min-height: 650px;
          margin: 0;
          padding: 42px 18px 12px;
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: minmax(360px, 560px) minmax(230px, 1fr);
          align-items: end;
          gap: 32px;
        }
        .test-surface .runner-panel { border: 0; background: transparent; padding: 0; position: relative; z-index: 2; width: min(560px, 100%); }
        .test-surface .result, .test-surface .gate { border: 1px solid var(--line-strong); background: rgba(245,245,239,.72); padding: 24px; border-radius: 22px; box-shadow: 0 22px 70px rgba(0,0,0,.12); }
        .signal-sculpture {
          position: absolute;
          z-index: 1;
          top: 12px;
          left: 42%;
          width: 520px;
          height: 390px;
          pointer-events: none;
          transform: perspective(820px) rotateX(18deg) rotateZ(-10deg);
          filter: drop-shadow(0 32px 42px rgba(0,0,0,.18));
        }
        .symbol {
          position: absolute;
          width: 86px;
          aspect-ratio: 1;
          border: 1px solid rgba(17,17,17,.12);
          border-radius: 14px;
          background: rgba(244,244,239,.34);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.48),
            inset 0 -14px 22px rgba(0,0,0,.05),
            0 20px 34px rgba(0,0,0,.1);
          opacity: .56;
          animation: symbolDrift 15s ease-in-out infinite;
          transform: translate3d(0,0,0);
        }
        .symbol::before,
        .symbol::after {
          content: "";
          position: absolute;
          display: block;
        }
        .dotset::before {
          width: 8px;
          height: 8px;
          left: 26px;
          top: 32px;
          border-radius: 999px;
          background: rgba(17,17,17,.76);
          box-shadow: 18px 0 0 rgba(17,17,17,.72), 36px 0 0 rgba(17,17,17,.7), 18px 18px 0 rgba(17,17,17,.62);
        }
        .bars::before {
          width: 4px;
          height: 48px;
          left: 36px;
          top: 19px;
          border-radius: 999px;
          background: rgba(17,17,17,.62);
          box-shadow: 14px 0 0 rgba(17,17,17,.52);
          transform: rotate(12deg);
        }
        .ring-symbol::before {
          inset: 22px;
          border: 3px solid rgba(17,17,17,.48);
          border-radius: 999px;
        }
        .ring-symbol::after {
          width: 8px;
          height: 8px;
          right: 19px;
          bottom: 22px;
          border-radius: 999px;
          background: rgba(17,17,17,.68);
        }
        .missing-symbol {
          display: grid;
          place-items: center;
          color: rgba(17,17,17,.45);
          font-family: "Arial Narrow", "Helvetica Neue Condensed", Arial, sans-serif;
          font-size: 42px;
          font-weight: 900;
        }
        .missing-symbol::before {
          content: "?";
          position: static;
        }
        .matrix-symbol {
          background:
            linear-gradient(rgba(17,17,17,.12), rgba(17,17,17,.12)) 50% 0 / 1px 100% no-repeat,
            linear-gradient(90deg, rgba(17,17,17,.12), rgba(17,17,17,.12)) 0 50% / 100% 1px no-repeat,
            rgba(244,244,239,.3);
        }
        .matrix-symbol::before {
          inset: 22px;
          border: 2px solid rgba(17,17,17,.4);
          border-radius: 999px;
        }
        .matrix-symbol::after {
          width: 7px;
          height: 7px;
          left: 24px;
          top: 25px;
          border-radius: 999px;
          background: rgba(17,17,17,.68);
          box-shadow: 29px 27px 0 rgba(17,17,17,.52);
        }
        .symbol.accent {
          border-color: rgba(90,90,86,.28);
          color: rgba(68,68,64,.5);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.48),
            0 0 24px rgba(120,120,112,.14),
            0 22px 36px rgba(0,0,0,.1);
        }
        .g1 { left: 32px; top: 70px; animation-delay: -2s; transform: rotate(-10deg) scale(.86); }
        .g2 { left: 128px; top: 24px; animation-delay: -8s; transform: rotate(18deg) scale(1.06); }
        .g3 { left: 230px; top: 78px; animation-delay: -4s; transform: rotate(-5deg) scale(.72); }
        .g4 { left: 340px; top: 24px; animation-delay: -11s; transform: rotate(7deg) scale(.92); }
        .g5 { left: 410px; top: 135px; animation-delay: -6s; transform: rotate(15deg) scale(.78); }
        .g6 { left: 190px; top: 176px; animation-delay: -12s; transform: rotate(10deg) scale(.64); opacity: .38; }
        .g7 { left: 42px; top: 224px; animation-delay: -5s; transform: rotate(-22deg) scale(.74); opacity: .4; }
        .g8 { left: 300px; top: 230px; animation-delay: -9s; transform: rotate(21deg) scale(.58); opacity: .34; }
        .g9 { left: 126px; top: 300px; animation-delay: -14s; transform: rotate(-8deg) scale(.5); opacity: .3; }
        .g10 { left: 382px; top: 285px; animation-delay: -3s; transform: rotate(4deg) scale(.48); opacity: .4; }
        @keyframes symbolDrift {
          0%, 100% { translate: 0 0; filter: blur(.1px); }
          35% { translate: 18px -16px; filter: blur(.5px); }
          65% { translate: -10px 12px; filter: blur(.2px); }
        }
        .mission-card {
          position: relative;
          z-index: 2;
          justify-self: end;
          align-self: end;
          width: min(300px, 100%);
          margin-bottom: 18px;
          display: grid;
          gap: 22px;
          color: var(--ink);
        }
        .mission-card > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .edition { font-size: 26px; letter-spacing: .22em; font-family: "Courier New", ui-monospace, monospace; }
        .sequence { font-size: 12px; font-family: "Courier New", ui-monospace, monospace; font-weight: 800; }
        .mission-card p { margin: 0; max-width: 240px; font-size: 12px; line-height: 18px; color: #292d2e; font-weight: 700; }
        .micro { min-height: 36px; justify-self: start; padding: 8px 22px; font-size: 11px; }
        .hero { max-width: 1180px; min-height: 660px; margin: 0 auto; padding: 26px 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 490px); align-items: center; gap: 34px; }
        .kicker {
          color: var(--ink);
          font-family: "Courier New", ui-monospace, monospace;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .12em;
          font-weight: 800;
          margin: 0;
        }
        h1 { font-family: "Arial Narrow", "Helvetica Neue Condensed", "Helvetica Neue", Arial, sans-serif; font-size: clamp(56px, 7vw, 82px); line-height: .98; margin: 16px 0 0; max-width: 760px; letter-spacing: .01em; text-transform: uppercase; }
        h2 { font-family: "Arial Narrow", "Helvetica Neue Condensed", "Helvetica Neue", Arial, sans-serif; font-size: clamp(25px, 4vw, 38px); line-height: 1.02; margin: 10px 0 0; letter-spacing: .01em; text-transform: uppercase; font-weight: 900; }
        .lede { max-width: 610px; color: var(--muted); font-size: 18px; line-height: 30px; margin: 22px 0 0; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
        .founding-stats, .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 34px; }
        .founding-stats div, .stats div { border: 1px solid var(--line); background: rgba(255,255,250,.22); border-radius: 18px; padding: 12px 14px; min-width: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.35); }
        .founding-stats strong, .stats strong { display: block; font-size: 23px; line-height: 1.1; letter-spacing: .04em; }
        .founding-stats span, .stats span { display: block; color: var(--muted); font-size: 10px; font-weight: 700; margin-top: 4px; letter-spacing: .08em; text-transform: uppercase; }
        .runner-panel, .leaderboard, .features, .profile-panel { border: 1px solid var(--line-strong); border-radius: 26px; background: rgba(244,244,238,.58); padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.42); }
        .mode-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .mode-button { flex: 1; min-width: 124px; border: 1px solid var(--line); background: rgba(255,255,250,.22); border-radius: 999px; padding: 10px 11px; display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .mode-button.active { background: var(--ink); color: var(--bg); border-color: var(--ink); }
        .mode-glyph { width: 22px; height: 22px; flex: 0 0 22px; border: 1px solid currentColor; border-radius: 8px; position: relative; display: inline-block; opacity: .76; }
        .mode-glyph::before, .mode-glyph::after { content: ""; position: absolute; display: block; }
        .mode-glyph.world::before { inset: 5px; border: 2px solid currentColor; border-radius: 999px; }
        .mode-glyph.world::after { left: 7px; right: 7px; bottom: 4px; height: 3px; border-top: 2px solid currentColor; }
        .mode-glyph.agi::before { width: 4px; height: 4px; left: 4px; top: 8px; border-radius: 999px; background: currentColor; box-shadow: 6px 0 0 currentColor, 12px 0 0 currentColor; }
        .mode-glyph.agi::after { left: 4px; right: 4px; bottom: 5px; height: 2px; border-radius: 999px; background: currentColor; }
        .mode-glyph.daily::before { left: 4px; right: 4px; top: 6px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 0 6px 0 currentColor; }
        .mode-glyph.daily::after { width: 3px; height: 3px; left: 5px; top: 3px; border-radius: 1px; background: currentColor; box-shadow: 8px 0 0 currentColor, 0 12px 0 currentColor, 8px 12px 0 currentColor; }
        .runner-intro { text-align: center; padding: 30px 0 22px; }
        .runner-icon { width: 48px; height: 48px; border-radius: 18px; display: grid; place-items: center; margin: 0 auto 16px; border: 1px solid var(--line-strong); background: rgba(255,255,250,.22); }
        .runner-intro p:not(.kicker), .free-note, .prompt, .answer-footer p { color: var(--muted); font-size: 14px; line-height: 22px; }
        .free-note { text-align: center; font-weight: 750; margin: 12px 0 0; }
        .progress-row, .question-head, .answer-footer, .section-head, .leaderboard-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .progress-row span { color: #363a3c; font-family: "Courier New", ui-monospace, monospace; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
        .live-score-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
        .live-score-row div { border: 1px solid rgba(17,17,17,.13); background: rgba(255,255,250,.24); box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 10px 24px rgba(0,0,0,.05); border-radius: 14px; padding: 10px 12px; min-width: 0; }
        .live-score-row span { display: block; color: var(--muted); font-size: 9px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap; }
        .live-score-row strong { display: block; margin-top: 3px; font-family: "Arial Narrow", "Helvetica Neue Condensed", Arial, sans-serif; font-size: 26px; line-height: 24px; letter-spacing: .02em; }
        .track { height: 4px; background: rgba(17,17,17,.08); border-radius: 999px; overflow: hidden; margin-top: 14px; box-shadow: inset 0 1px 2px rgba(0,0,0,.14); }
        .track div { height: 100%; background: linear-gradient(90deg, var(--ink), #5e5e5a, var(--accent)); border-radius: 999px; }
        .question-head { margin-top: 40px; }
        .question-head h2 { font-size: clamp(40px, 5vw, 58px); line-height: .92; margin: 0; font-weight: 900; }
        .question-head span { color: #363a3c; font-family: "Courier New", ui-monospace, monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; font-weight: 900; }
        .prompt { font-size: 15px; font-weight: 800; margin-top: 20px; }
        .matrix { width: 100%; max-width: 354px; margin: 28px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; perspective: 800px; }
        .tile { width: 108px; aspect-ratio: 1; border: 1px solid rgba(17,17,17,.18); border-radius: 3px; background: rgba(236,236,230,.42); position: relative; overflow: hidden; display: grid; place-items: center; box-shadow: inset 0 1px 0 rgba(255,255,255,.46), inset 0 -10px 20px rgba(0,0,0,.05), 0 14px 26px rgba(0,0,0,.09); }
        .tile.selected { background: rgba(255,255,250,.72); box-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 0 0 1px rgba(155,145,111,.28), 0 18px 34px rgba(0,0,0,.12); }
        .missing { background: rgba(34,37,38,.06); color: #6f777b; font-size: 34px; font-weight: 900; }
        .ring { position: absolute; width: 44%; aspect-ratio: 1; border: 2px solid; border-radius: 999px; opacity: .22; }
        .bars { position: absolute; display: flex; align-items: center; gap: 4px; }
        .bars span { width: 4px; height: 42px; border-radius: 999px; opacity: .78; box-shadow: 0 0 12px rgba(0,0,0,.08); }
        .dots { width: 50%; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
        .dots span { width: 11px; aspect-ratio: 1; border-radius: 999px; box-shadow: 0 0 10px rgba(0,0,0,.08); }
        .options { margin-top: 22px; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
        .option { border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 5px; display: grid; justify-items: center; gap: 6px; color: #6c7376; font-family: "Courier New", ui-monospace, monospace; font-size: 12px; font-weight: 900; letter-spacing: .06em; }
        .option.active { border-color: var(--ink); background: rgba(255,255,250,.32); color: var(--ink); }
        .answer-footer { border-top: 1px solid var(--line); padding-top: 18px; margin-top: 24px; }
        .answer-footer p { flex: 1; min-width: 180px; margin: 0; font-size: 12px; line-height: 18px; font-weight: 700; }
        .result-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; }
        .result-top .score { display: block; font-family: "Arial Narrow", "Helvetica Neue Condensed", Arial, sans-serif; font-size: 70px; line-height: 64px; letter-spacing: .01em; }
        .result-top span, .rank-card span, .leader-score span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; font-weight: 800; }
        .rank-card { border: 1px solid var(--line-strong); background: rgba(255,255,250,.24); border-radius: 18px; min-width: 126px; padding: 12px 14px; text-align: center; }
        .rank-card strong { font-size: 21px; }
        .three { margin-top: 16px; }
        .share-card { margin-top: 14px; background: var(--ink); color: #f5f5ee; border-radius: 22px; padding: 14px; display: grid; gap: 10px; }
        .share-card > div:first-child { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
        .share-card span { color: rgba(245,245,238,.66); font-family: "Courier New", ui-monospace, monospace; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .share-card p { margin: 0; line-height: 21px; font-family: "Courier New", ui-monospace, monospace; font-size: 11px; white-space: pre-wrap; color: rgba(245,245,238,.86); }
        .share-pattern { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; }
        .share-pattern span { display: block; height: 10px; border-radius: 2px; background: rgba(245,245,238,.18); border: 1px solid rgba(245,245,238,.16); }
        .share-pattern .hit { background: #f5f5ee; border-color: #f5f5ee; }
        .share-pattern .miss { background: transparent; }
        .qualification { margin-top: 14px; border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: rgba(255,255,250,.22); display: grid; gap: 3px; }
        .qualification.qualified { border-color: rgba(90,90,86,.34); background: rgba(255,255,250,.28); }
        .qualification span { color: var(--muted); font-size: 12px; line-height: 18px; font-weight: 700; }
        .trust-note { margin: 12px 0 0; color: #676b6d; font-size: 11px; line-height: 18px; font-weight: 700; }
        .leaderboard, .features, .profile-panel { max-width: 1180px; margin: 16px auto 0; }
        .section-head p { color: var(--muted); max-width: 720px; line-height: 24px; }
        .leaderboard-rows { display: grid; gap: 8px; margin-top: 18px; }
        .leaderboard-row { border: 1px solid var(--line); border-radius: 18px; padding: 12px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 70px; align-items: center; gap: 12px; background: rgba(255,255,250,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.28); }
        .leaderboard-row.local { border-color: var(--ink); background: rgba(255,255,250,.38); }
        .empty-board { border: 1px solid var(--line); border-radius: 18px; padding: 18px; display: grid; gap: 6px; background: rgba(255,255,250,.2); }
        .empty-board span { color: var(--muted); font-size: 13px; line-height: 20px; font-weight: 700; }
        .rank { width: 42px; height: 42px; display: grid; place-items: center; background: rgba(255,255,250,.28); border: 1px solid var(--line-strong); border-radius: 14px; font-weight: 900; }
        .leader-copy { display: grid; min-width: 0; }
        .leader-copy span { color: var(--muted); font-size: 12px; line-height: 18px; font-weight: 700; }
        .leader-score { text-align: right; }
        .leader-score strong { display: block; font-family: "Arial Narrow", "Helvetica Neue Condensed", Arial, sans-serif; font-size: 28px; line-height: 28px; }
        .geo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
        .geo-column { min-width: 0; }
        .geo-column-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; color: var(--muted); font-family: "Courier New", ui-monospace, monospace; font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
        .geo-column-head strong { color: var(--ink); font-size: 13px; }
        .geo-rows .leaderboard-row { grid-template-columns: 38px minmax(0, 1fr) 58px; }
        .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 22px; }
        .feature-grid article { border: 1px solid var(--line); border-radius: 22px; padding: 18px; background: rgba(255,255,250,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.28); }
        .feature-grid p, .monetization p { color: var(--muted); line-height: 22px; }
        .monetization { margin-top: 16px; border: 1px solid var(--line-strong); border-radius: 24px; padding: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; background: rgba(255,255,250,.24); }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(14,15,15,.66); display: grid; place-items: center; padding: 18px; z-index: 10; backdrop-filter: blur(12px); }
        .modal { width: min(460px, 100%); background: linear-gradient(145deg, #efefea, #d9d9d2); border: 1px solid rgba(255,255,255,.3); border-radius: 28px; padding: 24px; position: relative; box-shadow: inset 0 1px 0 rgba(255,255,255,.58), 0 30px 90px rgba(0,0,0,.42); }
        .close { position: absolute; top: 12px; right: 12px; border: 1px solid var(--line); background: rgba(255,255,250,.24); color: var(--ink); border-radius: 999px; width: 34px; height: 34px; font-size: 20px; }
        .modal p:not(.kicker), .fine-print { color: var(--muted); line-height: 22px; }
        .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
        .plans div { border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,250,.28); padding: 12px; display: grid; gap: 2px; }
        .plans span, .fine-print { font-size: 11px; font-weight: 750; }
        .fine-print { display: block; margin-top: 10px; text-align: center; }
        .stacked-actions { display: grid; gap: 10px; }
        .auth-options { display: grid; gap: 8px; }
        .auth-card { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,250,.22); padding: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.36); }
        .auth-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .google-auth { gap: 10px; border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.035); }
        .google-mark { width: 18px; height: 18px; display: inline-grid; place-items: center; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; color: #f4f5f6; font-family: "Space Grotesk", system-ui, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0; }
        .fine-print.error { color: #6f2727; }
        .fine-print.success { color: #244f37; }
        @media (max-width: 940px) {
          .hero { grid-template-columns: 1fr; min-height: 0; }
          .hero-tool { max-width: 520px; }
          .test-surface { grid-template-columns: 1fr; min-height: 0; }
          .mission-card { justify-self: start; margin: 16px 0 0; }
          .signal-sculpture { opacity: .42; left: 38%; top: 28px; transform: scale(.82) perspective(760px) rotateX(22deg) rotateZ(-18deg); }
        }
        @media (max-width: 620px) {
          main { width: calc(100vw - 18px); min-height: calc(100vh - 18px); margin: 9px auto; padding: 22px; border-radius: 26px; }
          main::before { inset: 12px; border-radius: 18px; }
          nav { align-items: flex-start; padding-top: 18px; }
          nav > div:last-child { gap: 4px; justify-content: flex-start; }
          nav strong { font-size: 30px; }
          nav span { font-size: 9px; letter-spacing: .12em; }
          nav button { padding: 6px 6px; font-size: 14px; letter-spacing: .02em; }
          nav .nav-cta { min-height: 44px; padding: 8px 18px; }
          h1 { font-size: 58px; }
          .lede { font-size: 17px; line-height: 29px; }
          .test-surface { padding: 54px 0 0; }
          .signal-sculpture { top: 58px; left: 8%; width: 300px; height: 230px; opacity: .32; transform: scale(.62) perspective(760px) rotateX(22deg) rotateZ(-18deg); }
          .signal-sculpture .g5, .signal-sculpture .g10 { display: none; }
          .question-head { margin-top: 36px; }
          .question-head h2 { font-size: 42px; }
          .matrix { max-width: 100%; gap: 9px; }
          .founding-stats { grid-template-columns: 1fr 1fr; }
          .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .tile { width: min(116px, 28vw); }
          .option { width: calc(50% - 8px); }
          .option .tile { width: min(116px, 28vw); }
          .answer-footer { align-items: flex-start; }
          .answer-footer .primary { width: 100%; }
          .live-score-row { gap: 6px; }
          .live-score-row div { border-radius: 12px; padding: 8px; }
          .live-score-row span { font-size: 8px; letter-spacing: .08em; }
          .live-score-row strong { font-size: 22px; line-height: 22px; }
          .feature-grid { grid-template-columns: 1fr; }
          .geo-grid { grid-template-columns: 1fr; }
          .leaderboard-row { grid-template-columns: 38px minmax(0, 1fr) 54px; padding: 10px; }
          .leader-score strong { font-size: 21px; }
          .plans { grid-template-columns: 1fr; }
        }

        body {
          background: #060708;
          color: #e9ebec;
          font-family: "Space Grotesk", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        main {
          width: 100%;
          min-height: 100vh;
          margin: 0;
          padding: clamp(16px, 3vw, 30px) clamp(16px, 4vw, 40px) 72px;
          border-radius: 0;
          border: 0;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(130% 90% at 50% -12%, #16181b 0%, #0b0c0e 44%, #060708 100%);
          color: #e9ebec;
          box-shadow: none;
        }
        main::before {
          content: "";
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
          border: 0;
          border-radius: 0;
          background-image:
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(120% 90% at 50% 30%, #000 40%, transparent 78%);
          z-index: 0;
        }
        nav,
        .test-surface,
        .leaderboard,
        .features,
        .profile-panel {
          position: relative;
          z-index: 2;
          width: min(1200px, 100%);
          margin-left: auto;
          margin-right: auto;
        }
        nav {
          padding: 0 0 18px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          align-items: center;
        }
        .brand {
          color: #f4f5f6;
          gap: 0;
        }
        nav strong {
          font-family: "Space Grotesk", system-ui, sans-serif;
          font-size: 19px;
          font-weight: 700;
          letter-spacing: .16em;
          line-height: 1;
        }
        nav > div:last-child {
          gap: clamp(10px, 1.6vw, 20px);
        }
        nav button {
          color: #9fa4a8;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .18em;
          text-transform: uppercase;
          background: transparent;
          border: 0;
          border-radius: 0;
          padding: 4px 1px;
          min-height: 32px;
          box-shadow: none;
        }
        nav .brand,
        nav .brand strong {
          color: #f4f5f6;
          opacity: 1;
        }
        nav button.active {
          color: #f4f5f6;
          background: transparent;
          border-bottom: 1px solid #f4f5f6;
        }
        nav .nav-cta {
          color: #e9ebec;
          min-height: 40px;
          padding: 10px 15px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 3px;
          background: rgba(255,255,255,.03);
        }
        .language-pill {
          min-height: 28px;
          padding: 0 9px;
          border-color: rgba(255,255,255,.12);
          border-radius: 3px;
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        .test-surface {
          display: grid;
          grid-template-columns: minmax(360px, 600px) minmax(248px, 320px);
          justify-content: space-between;
          align-items: start;
          gap: clamp(20px, 3vw, 40px);
          min-height: 0;
          margin-top: clamp(28px, 5vh, 56px);
          padding: 0;
        }
        .test-surface .runner-panel,
        .runner-panel,
        .leaderboard,
        .features,
        .profile-panel,
        .rail-panel {
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          background: linear-gradient(160deg, rgba(20,22,25,.86), rgba(11,12,14,.86));
          box-shadow: 0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);
          color: #e9ebec;
        }
        .test-surface .runner-panel,
        .runner-panel {
          width: 100%;
          padding: clamp(20px, 3vw, 32px);
          overflow: hidden;
        }
        .runner-panel.gate,
        .runner-panel.result {
          padding: clamp(24px, 4vw, 40px);
        }
        .kicker,
        .progress-row span,
        .question-head span,
        .answer-footer p,
        .rail-label,
        .rail-mono,
        .trust-note,
        .fine-print,
        .share-card span,
        .share-card p,
        .leader-copy span,
        .leader-score span,
        .empty-board span {
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
        }
        .kicker,
        .rail-label {
          color: #9fa4a8;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .22em;
          text-transform: uppercase;
        }
        .progress-row,
        .question-head,
        .answer-footer,
        .section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .progress-row span,
        .question-head span {
          color: #5c6166;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: .18em;
          white-space: nowrap;
        }
        .live-score-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          margin-top: 16px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255,255,255,.08);
        }
        .live-score-row div {
          min-width: 0;
          padding: 12px;
          background: rgba(9,10,11,.72);
        }
        .live-score-row span {
          display: block;
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: .16em;
          line-height: 1.3;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .live-score-row strong {
          display: block;
          margin-top: 5px;
          color: #f4f5f6;
          font-family: "Space Grotesk", system-ui, sans-serif;
          font-size: 26px;
          font-weight: 500;
          letter-spacing: -.015em;
          line-height: 1;
        }
        .track {
          height: 1px;
          margin-top: 14px;
          background: rgba(255,255,255,.08);
          box-shadow: none;
        }
        .track div {
          background: linear-gradient(90deg, #f4f5f6, rgba(244,245,246,.2));
          border-radius: 0;
        }
        .question-head {
          margin-top: 24px;
          align-items: flex-end;
        }
        .question-head h2,
        .section-head h2,
        .features h2,
        .leaderboard h2,
        .gate h2,
        .modal h2 {
          color: #f4f5f6;
          font-size: clamp(22px, 3.4vw, 30px);
          font-weight: 500;
          line-height: 1.05;
          letter-spacing: -.015em;
          margin: 0;
        }
        .prompt,
        .free-note,
        .section-head p,
        .feature-grid p,
        .monetization p,
        .qualification span,
        .modal p:not(.kicker) {
          color: #969ba0;
          font-size: 14px;
          line-height: 1.6;
        }
        .prompt {
          margin-top: 10px;
          font-weight: 400;
        }
        .matrix {
          max-width: 360px;
          margin: 24px 0 0;
          gap: 9px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 6px;
          background: rgba(255,255,255,.02);
          perspective: none;
        }
        .tile {
          width: 100%;
          min-width: 0;
          aspect-ratio: 1;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 3px;
          background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), inset 0 -18px 30px rgba(0,0,0,.24);
        }
        .tile.selected,
        .option.active .tile {
          border-color: rgba(244,245,246,.72);
          background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
          box-shadow: 0 0 0 1px rgba(244,245,246,.16), inset 0 0 0 1px rgba(255,255,255,.05);
        }
        .missing {
          color: #9fa4a8;
          background: rgba(255,255,255,.025);
          font-size: 30px;
          font-weight: 400;
        }
        .ring {
          opacity: .35;
        }
        .tile .bars {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .tile .bars span {
          width: 3px;
          height: 40px;
          border-radius: 999px;
          opacity: .95;
          box-shadow: none;
        }
        .dots {
          width: 54%;
          gap: 4px;
        }
        .dots span {
          width: 5px;
          box-shadow: 0 0 12px rgba(255,255,255,.18);
        }
        .options {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          justify-content: flex-start;
          gap: clamp(10px, 1.4vw, 14px);
          margin-top: 26px;
        }
        .option {
          width: 100%;
          min-width: 0;
          padding: 0;
          gap: 9px;
          border: 0;
          border-radius: 0;
          color: #5c6166;
          background: transparent;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .16em;
        }
        .option .tile {
          width: 100%;
        }
        .option.active {
          color: #f4f5f6;
          border: 0;
          background: transparent;
        }
        .answer-footer {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,.08);
          align-items: center;
        }
        .answer-footer p {
          color: #5c6166;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: .12em;
          line-height: 1.5;
          text-transform: uppercase;
        }
        .primary,
        .secondary {
          border-radius: 3px;
          min-height: 48px;
          padding: 0 24px;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .16em;
          text-transform: uppercase;
          box-shadow: none;
        }
        .primary {
          color: #0a0b0c;
          background: #f4f5f6;
          border: 0;
        }
        .secondary {
          color: #e9ebec;
          background: transparent;
          border: 1px solid rgba(255,255,255,.18);
        }
        .secondary.copied {
          color: #baf5cf;
          border-color: rgba(186,245,207,.46);
          background: rgba(186,245,207,.06);
        }
        .copy-confirmation {
          display: block;
          margin-top: -4px;
          color: #baf5cf;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .16em;
          line-height: 1.3;
          text-align: center;
          text-transform: uppercase;
        }
        .auth-options {
          display: grid;
          gap: 8px;
        }
        .auth-card {
          display: grid;
          gap: 10px;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 8px;
          background: rgba(255,255,255,.025);
          padding: 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .auth-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .google-auth {
          gap: 10px;
          border-color: rgba(255,255,255,.28);
          background: rgba(255,255,255,.035);
        }
        .google-mark {
          width: 18px;
          height: 18px;
          display: inline-grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.24);
          border-radius: 999px;
          color: #f4f5f6;
          font-family: "Space Grotesk", system-ui, sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
        }
        .full {
          width: 100%;
        }
        .status-rail {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }
        .rail-panel {
          padding: 22px;
        }
        .geo-globe-panel {
          position: relative;
          overflow: hidden;
          padding: 18px 18px 16px;
          min-height: 350px;
          background:
            radial-gradient(circle at 50% 34%, rgba(255,255,255,.08), transparent 38%),
            linear-gradient(160deg, rgba(22,24,28,.96), rgba(7,8,10,.94));
        }
        .globe-copy {
          position: relative;
          z-index: 2;
        }
        .geo-globe-panel .globe-copy strong {
          max-width: 100%;
          margin-top: 8px;
          font-size: 20px;
          line-height: 1.02;
          letter-spacing: -.01em;
          overflow-wrap: anywhere;
        }
        .geo-globe-panel .globe-copy span {
          min-height: 38px;
        }
        .globe-shell {
          position: relative;
          width: min(250px, 100%);
          aspect-ratio: 1;
          margin: 20px auto 10px;
          display: grid;
          place-items: center;
          perspective: 760px;
        }
        .globe-sphere {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 999px;
          overflow: hidden;
          background:
            radial-gradient(circle at 38% 26%, rgba(255,255,255,.22), rgba(255,255,255,.045) 21%, transparent 38%),
            radial-gradient(circle at 64% 62%, rgba(184,231,255,.1), transparent 35%),
            linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.01) 45%, rgba(0,0,0,.5));
          box-shadow:
            inset -30px -36px 76px rgba(0,0,0,.7),
            inset 18px 14px 44px rgba(255,255,255,.07),
            0 28px 72px rgba(0,0,0,.54),
            0 0 80px rgba(160,185,205,.08);
          transform: rotateX(9deg) rotateZ(-8deg);
        }
        .globe-sphere::before {
          content: "";
          position: absolute;
          inset: -12%;
          border-radius: 999px;
          background:
            linear-gradient(90deg, transparent 0 44%, rgba(255,255,255,.045) 50%, transparent 56%),
            repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 26px),
            repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 28px);
          opacity: .42;
          transform: rotate(13deg);
          animation: globeGrid 18s linear infinite;
        }
        .globe-sphere::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 31% 22%, rgba(255,255,255,.28), transparent 18%), linear-gradient(90deg, transparent 0 52%, rgba(0,0,0,.38) 88%);
          pointer-events: none;
        }
        .globe-grid {
          position: absolute;
          inset: 8%;
          border-radius: 999px;
          pointer-events: none;
          opacity: .34;
        }
        .globe-grid.latitude {
          background: repeating-linear-gradient(0deg, transparent 0 22px, rgba(255,255,255,.12) 23px, transparent 24px);
          mask-image: radial-gradient(circle, #000 66%, transparent 68%);
        }
        .globe-grid.longitude {
          background: repeating-linear-gradient(90deg, transparent 0 25px, rgba(255,255,255,.12) 26px, transparent 27px);
          mask-image: radial-gradient(circle, #000 66%, transparent 68%);
          animation: globeGrid 24s linear infinite reverse;
        }
        .globe-region {
          position: absolute;
          z-index: 3;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255,255,255,.42);
          animation: globePulse 2.8s ease-in-out infinite;
        }
        .globe-region::after {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          border: 1px solid currentColor;
          opacity: .2;
        }
        .globe-orbit {
          position: absolute;
          inset: 3%;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.075);
          transform: rotateX(74deg) rotateZ(-16deg);
        }
        .globe-orbit.orbit-b {
          inset: 11%;
          transform: rotateX(62deg) rotateZ(68deg);
          opacity: .58;
        }
        .globe-metrics {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 6px;
          background: rgba(255,255,255,.08);
        }
        .globe-metrics div {
          min-width: 0;
          padding: 10px 12px;
          background: rgba(5,6,7,.58);
        }
        .globe-metrics strong {
          margin: 0;
          color: #f4f5f6;
          font-size: 18px;
          line-height: 1;
          letter-spacing: 0;
          text-transform: none;
        }
        .globe-metrics span {
          margin-top: 5px;
          color: #6f767b;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 9px;
          letter-spacing: .16em;
          line-height: 1.2;
          text-transform: uppercase;
        }
        .x-panel {
          display: grid;
          gap: 12px;
        }
        .x-panel strong,
        .x-panel span {
          margin-top: 0;
        }
        .rail-panel strong {
          display: block;
          margin-top: 12px;
          color: #f4f5f6;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .rail-panel span {
          display: block;
          margin-top: 10px;
          color: #8f959a;
          font-size: 12px;
          line-height: 1.55;
        }
        .rail-rule {
          height: 1px;
          margin: 20px 0;
          background: rgba(255,255,255,.08);
        }
        .rail-mono {
          color: #b9bec2 !important;
          font-size: 12px !important;
          letter-spacing: .06em;
        }
        .friend-panel {
          display: grid;
          gap: 14px;
        }
        .friend-panel strong,
        .friend-panel span {
          margin-top: 0;
        }
        .name-field {
          display: grid;
          gap: 7px;
        }
        .name-field span {
          margin: 0;
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .16em;
          line-height: 1;
          text-transform: uppercase;
        }
        .name-field input {
          width: 100%;
          min-height: 40px;
          color: #f4f5f6;
          background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 3px;
          padding: 0 12px;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 12px;
          letter-spacing: .04em;
          outline: none;
        }
        .name-field input:focus {
          border-color: rgba(244,245,246,.54);
        }
        @keyframes globePulse {
          0%, 100% { scale: .82; filter: saturate(.9); }
          50% { scale: 1.08; filter: saturate(1.22); }
        }
        @keyframes globeGrid {
          0% { transform: rotate(13deg) translateX(-5%); }
          100% { transform: rotate(13deg) translateX(5%); }
        }
        .rail-price {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .rail-price strong {
          margin: 0;
          font-size: 13px;
          white-space: nowrap;
        }
        .unlock-panel ul {
          list-style: none;
          padding: 0;
          margin: 18px 0;
          display: grid;
          gap: 11px;
        }
        .unlock-panel li {
          color: #b9bec2;
          font-size: 12.5px;
          line-height: 1.45;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .unlock-panel li::before {
          content: "";
          width: 5px;
          height: 5px;
          flex: 0 0 5px;
          background: #6c7176;
        }
        .result-top {
          align-items: flex-end;
          margin-top: 24px;
        }
        .result-top .score {
          color: #f7f8f9;
          font-family: "Space Grotesk", system-ui, sans-serif;
          font-size: clamp(60px, 12vw, 104px);
          font-weight: 500;
          line-height: .9;
          letter-spacing: -.03em;
        }
        .rank-card {
          min-width: 0;
          border: 0;
          border-left: 1px solid rgba(255,255,255,.10);
          border-radius: 0;
          background: transparent;
          padding: 0 0 0 clamp(20px, 4vw, 44px);
          text-align: left;
        }
        .rank-card strong {
          color: #e9ebec;
          font-size: clamp(28px, 5vw, 40px);
          font-weight: 500;
          letter-spacing: -.02em;
        }
        .result-top span,
        .rank-card span,
        .leader-score span {
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: .2em;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          margin-top: 28px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 5px;
          overflow: hidden;
        }
        .stats div {
          border: 0;
          border-radius: 0;
          background: #0e1012;
          padding: 16px 14px;
          box-shadow: none;
        }
        .stats strong {
          color: #e9ebec;
          font-size: 22px;
          font-weight: 500;
          letter-spacing: 0;
        }
        .stats span {
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 9.5px;
          font-weight: 500;
          letter-spacing: .16em;
        }
        .share-card {
          margin-top: 24px;
          background: #0b0c0e;
          color: #e9ebec;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 6px;
          padding: 18px;
        }
        .share-card p {
          color: #8f959a;
          font-size: 10.5px;
          letter-spacing: .05em;
        }
        .share-pattern span {
          height: 10px;
          border-radius: 1px;
          background: rgba(255,255,255,.14);
          border: 0;
        }
        .share-pattern .hit {
          background: #f4f5f6;
        }
        .qualification {
          margin-top: 24px;
          border: 1px solid rgba(255,255,255,.10);
          border-left: 2px solid #f4f5f6;
          border-radius: 6px;
          background: rgba(255,255,255,.025);
          padding: 18px;
        }
        .qualification strong {
          color: #f4f5f6;
          font-size: 15px;
          font-weight: 600;
        }
        .qualification span {
          color: #969ba0;
          font-weight: 400;
        }
        .trust-note {
          color: #4f5458;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .06em;
          line-height: 1.6;
        }
        .leaderboard,
        .features,
        .profile-panel {
          margin-top: clamp(28px, 5vh, 56px);
          padding: clamp(24px, 4vw, 40px);
        }
        .profile-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          margin-top: 28px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255,255,255,.08);
        }
        .profile-stats div {
          min-width: 0;
          padding: 18px;
          background: #0e1012;
        }
        .profile-stats strong {
          display: block;
          color: #f4f5f6;
          font-family: "Space Grotesk", system-ui, sans-serif;
          font-size: clamp(20px, 3vw, 32px);
          font-weight: 500;
          letter-spacing: -.015em;
          line-height: 1;
        }
        .profile-stats span,
        .history-day span,
        .history-day strong {
          display: block;
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .16em;
          line-height: 1.35;
          text-transform: uppercase;
        }
        .history-strip {
          display: flex;
          align-items: end;
          gap: 10px;
          min-height: 150px;
          margin-top: 26px;
          padding-top: 24px;
          border-top: 1px solid rgba(255,255,255,.08);
          overflow-x: auto;
        }
        .history-day {
          min-width: 54px;
          display: grid;
          justify-items: center;
          gap: 8px;
        }
        .history-day i {
          width: 100%;
          min-height: 18px;
          display: block;
          border: 1px solid rgba(255,255,255,.12);
          background: linear-gradient(180deg, rgba(244,245,246,.55), rgba(244,245,246,.08));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }
        .history-day strong {
          color: #e9ebec;
          letter-spacing: .08em;
        }
        .leaderboard-rows {
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          overflow: hidden;
          gap: 0;
        }
        .geo-grid {
          gap: 14px;
        }
        .geo-column-head {
          color: #5c6166;
          font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .18em;
        }
        .geo-column-head strong {
          color: #f4f5f6;
          font-weight: 600;
        }
        .geo-rows .leaderboard-row {
          grid-template-columns: 36px minmax(0, 1fr) 58px;
        }
        .social-board + .social-board {
          margin-top: 20px;
        }
        .leaderboard-row,
        .empty-board,
        .feature-grid article,
        .monetization,
        .plans div {
          border: 0;
          border-radius: 0;
          background: #0e1012;
          box-shadow: none;
        }
        .leaderboard-row + .leaderboard-row {
          border-top: 1px solid rgba(255,255,255,.07);
        }
        .leaderboard-row.local {
          border-color: transparent;
          background: #131619;
        }
        .rank {
          border-color: rgba(255,255,255,.12);
          background: rgba(255,255,255,.03);
          color: #e9ebec;
          border-radius: 3px;
        }
        .leader-copy strong,
        .feature-grid strong,
        .monetization strong {
          color: #f4f5f6;
        }
        .feature-grid,
        .plans {
          gap: 1px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255,255,255,.08);
        }
        .monetization {
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          padding: 24px;
        }
        .modal-backdrop {
          background: rgba(6,7,8,.74);
          z-index: 50;
        }
        .modal {
          width: min(440px, 100%);
          color: #e9ebec;
          background: linear-gradient(160deg, #16181b, #0c0d0f);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 10px;
          padding: clamp(24px, 4vw, 34px);
          box-shadow: 0 40px 120px rgba(0,0,0,.7);
        }
        .modal h2 {
          margin-top: 14px;
        }
        .close {
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          color: #9fa4a8;
          background: transparent;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 3px;
        }
        .fine-print.error {
          color: #ff9a9a;
        }
        .fine-print.success {
          color: #baf5cf;
        }
        .signal-sculpture {
          position: absolute;
          z-index: 1;
          width: 620px;
          height: 420px;
          right: max(-120px, calc((100vw - 1200px) / 2 - 130px));
          top: 110px;
          opacity: .2;
          transform: perspective(900px) rotateX(18deg) rotateZ(-16deg);
          pointer-events: none;
          filter: saturate(0);
        }
        .symbol {
          position: absolute;
          display: block;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.025);
          animation: symbolDrift 12s ease-in-out infinite;
        }
        .signal-sculpture .dotset {
          width: 88px;
          height: 88px;
          border-radius: 4px;
        }
        .signal-sculpture .dotset::before {
          content: "";
          position: absolute;
          width: 5px;
          height: 5px;
          left: 28px;
          top: 28px;
          border-radius: 999px;
          background: rgba(255,255,255,.68);
          box-shadow: 18px 0 0 rgba(255,255,255,.62), 36px 0 0 rgba(255,255,255,.58), 18px 18px 0 rgba(255,255,255,.5);
        }
        .signal-sculpture .bars {
          width: 92px;
          height: 92px;
          border-radius: 4px;
        }
        .signal-sculpture .bars::before {
          content: "";
          position: absolute;
          width: 3px;
          height: 46px;
          left: 33px;
          top: 23px;
          background: rgba(255,255,255,.62);
          box-shadow: 16px 0 0 rgba(255,255,255,.52), 32px 0 0 rgba(255,255,255,.42);
        }
        .ring-symbol {
          width: 108px;
          height: 108px;
          border-radius: 999px;
          background: transparent;
        }
        .ring-symbol::before {
          content: "";
          position: absolute;
          inset: 25px;
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 999px;
        }
        .missing-symbol {
          width: 98px;
          height: 98px;
          border-radius: 4px;
        }
        .missing-symbol::before {
          content: "?";
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: rgba(255,255,255,.34);
          font-size: 34px;
        }
        .matrix-symbol {
          width: 128px;
          height: 128px;
          border-radius: 4px;
          background-image:
            linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px);
          background-size: 42px 42px;
        }
        .accent {
          box-shadow: 0 0 40px rgba(255,255,255,.08);
        }
        .g1 { left: 32px; top: 70px; animation-delay: -2s; }
        .g2 { left: 148px; top: 20px; animation-delay: -8s; transform: rotate(12deg); }
        .g3 { left: 290px; top: 56px; animation-delay: -4s; }
        .g4 { left: 430px; top: 12px; animation-delay: -10s; }
        .g5 { left: 390px; top: 150px; animation-delay: -6s; }
        .g6 { left: 190px; top: 190px; animation-delay: -12s; transform: scale(.74); opacity: .56; }
        .g7 { left: 70px; top: 245px; animation-delay: -3s; transform: rotate(-8deg) scale(.82); }
        .g8 { left: 300px; top: 280px; animation-delay: -7s; transform: scale(.68); }
        .g9 { left: 125px; top: 330px; animation-delay: -14s; transform: scale(.55); opacity: .42; }
        .g10 { left: 500px; top: 290px; animation-delay: -5s; transform: scale(.6); opacity: .64; }
        @keyframes symbolDrift {
          0%, 100% { translate: 0 0; }
          50% { translate: 8px -14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .symbol,
          .globe-sphere::before,
          .globe-grid.longitude,
          .globe-region {
            animation: none;
          }
        }
        @media (max-width: 940px) {
          main {
            padding: 18px 18px 56px;
          }
          .test-surface {
            grid-template-columns: 1fr;
          }
          .status-rail {
            max-width: none;
          }
          .signal-sculpture {
            right: -180px;
            top: 118px;
            opacity: .12;
            transform: scale(.76) perspective(900px) rotateX(18deg) rotateZ(-16deg);
          }
        }
        @media (max-width: 620px) {
          main {
            width: 100%;
            min-height: 100vh;
            margin: 0;
            padding: 18px 14px 46px;
            border-radius: 0;
          }
          nav {
            padding-top: 0;
            gap: 14px;
          }
          nav > div:last-child {
            width: 100%;
            justify-content: space-between;
            gap: 8px;
          }
          nav strong {
            font-size: 18px;
          }
          nav button {
            font-size: 10px;
            min-height: 30px;
          }
          nav .nav-cta {
            padding: 8px 10px;
            min-height: 36px;
          }
          .test-surface {
            margin-top: 28px;
            padding: 0;
          }
          .test-surface .runner-panel,
          .runner-panel,
          .rail-panel,
          .leaderboard,
          .features,
          .profile-panel {
            padding: 20px;
          }
          .progress-row,
          .question-head,
          .answer-footer,
          .result-top {
            align-items: flex-start;
          }
          .question-head h2 {
            font-size: 28px;
          }
          .matrix {
            max-width: 100%;
            padding: 12px;
            gap: 8px;
          }
          .options {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }
          .option,
          .option .tile {
            width: 100%;
          }
          .answer-footer .primary {
            width: 100%;
          }
          .live-score-row div {
            padding: 9px;
          }
          .live-score-row span {
            font-size: 8px;
            letter-spacing: .1em;
          }
          .live-score-row strong {
            font-size: 22px;
          }
          .geo-globe-panel {
            min-height: 330px;
          }
          .globe-shell {
            width: min(232px, 100%);
          }
          .stats,
          .profile-stats,
          .plans {
            grid-template-columns: 1fr;
          }
          .auth-row {
            grid-template-columns: 1fr;
          }
          .rank-card {
            width: 100%;
            padding-left: 0;
            padding-top: 18px;
            border-left: 0;
            border-top: 1px solid rgba(255,255,255,.10);
          }
          .signal-sculpture {
            top: 120px;
            right: -280px;
            transform: scale(.58) perspective(900px) rotateX(18deg) rotateZ(-16deg);
          }
          .geo-grid {
            grid-template-columns: 1fr;
          }
          .leaderboard-row {
            grid-template-columns: 36px minmax(0, 1fr);
          }
          .leader-score {
            grid-column: 2;
            text-align: left;
          }
        }
      `}</style>
    </main>
  );
}
