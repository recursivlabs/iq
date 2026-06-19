'use client';

import * as React from 'react';

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

type PlayUsage = {
  day: string;
  count: number;
};

type PaidAccessRecord = {
  active: boolean;
  sessionId?: string;
  subscriptionId?: string | null;
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
  timestamp: number;
};

const DAILY_PLAY_LIMIT = 6;
const UNLIMITED_PRICE_LABEL = '$4.99/mo';
const RECURSIV_SIGNUP_URL = 'https://recursiv.io/register';
const LEGACY_FREE_PLAY_STORAGE_KEY = 'world-iq-free-play-date';
const PLAY_USAGE_STORAGE_KEY = 'world-iq-play-usage';
const LEADERBOARD_STORAGE_KEY = 'world-iq-leaderboard';
const PAID_ACCESS_STORAGE_KEY = 'world-iq-paid-access';
const OFFICIAL_RANK_STORAGE_KEY = 'world-iq-official-rank';

const tones: Record<TileTone, string> = {
  ink: '#111111',
  blue: '#202326',
  green: '#252827',
  rose: '#2a272a',
  amber: '#2c2a25',
};

const modes: Record<ModeKey, { label: string; title: string; body: string; cta: string }> = {
  world: {
    label: 'Today\'s World IQ',
    title: 'Lock today\'s reasoning rank.',
    body: 'A daily 12-question visual reasoning game. Your first completed World run is the official rank.',
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
    title: 'One puzzle. One warmup.',
    body: 'A fast puzzle for streaks and group chats. World IQ is the official ranked mode.',
    cta: 'Warm up',
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
  { ...worldPuzzles[3], id: 'daily-01', mode: 'daily', title: 'Daily diagonal', difficulty: 'Today', prompt: 'One puzzle for today. Lock your answer.' },
  { ...worldPuzzles[6], id: 'daily-02', mode: 'daily', title: 'Daily conservation', difficulty: 'Today', prompt: 'One puzzle for today. Lock your answer.' },
  { ...worldPuzzles[8], id: 'daily-03', mode: 'daily', title: 'Daily dual axis', difficulty: 'Today', prompt: 'One puzzle for today. Lock your answer.' },
];

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function todayPuzzle() {
  const day = Math.floor(Date.now() / 86_400_000);
  return dailyPuzzles[day % dailyPuzzles.length];
}

function getQuestions(mode: ModeKey) {
  if (mode === 'agi') return agiPuzzles;
  if (mode === 'daily') return [todayPuzzle()];
  return worldPuzzles;
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

function worldIqScore(correct: number, total: number) {
  if (total === 1) return correct ? 138 : 104;
  return Math.round(92 + (correct / total) * 54);
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

function readPaidAccess() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PAID_ACCESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<PaidAccessRecord> : null;
    return Boolean(parsed?.active);
  } catch {
    return false;
  }
}

function savePaidAccess(record: Omit<PaidAccessRecord, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PAID_ACCESS_STORAGE_KEY, JSON.stringify({ ...record, updatedAt: Date.now() }));
}

function clearCheckoutQuery() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getStripeCheckoutHref(href: string) {
  if (!href) return '';
  try {
    const url = new URL(href);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'buy.stripe.com' || hostname.endsWith('.stripe.com')) return href;
  } catch {
    return '';
  }
  return '';
}

function sharePattern(answers: AnswerRecord[]) {
  return answers.map((answer) => (answer.correct ? '1' : '0')).join('');
}

function buildShareText({
  mode,
  score,
  rank,
  percentile,
  correct,
  total,
  beatAi,
  answers,
  status,
}: {
  mode: ModeKey;
  score: number;
  rank: string;
  percentile: number;
  correct: number;
  total: number;
  beatAi: number;
  answers: AnswerRecord[];
  status: 'official' | 'practice' | 'daily' | 'lab' | 'pending';
}) {
  const topLabel = percentile >= 99.9 ? 'top 0.1%' : `top ${(100 - percentile).toFixed(percentile >= 99 ? 1 : 0)}%`;
  if (mode === 'world') {
    const label = status === 'practice' ? 'World IQ practice' : `World IQ ${localDayKey()}`;
    return `${label}: ${score} reasoning | ${rank} | ${topLabel} | ${correct}/${total} | AI misses ${beatAi}\n${sharePattern(answers)}\niq.on.recursiv.io`;
  }
  if (mode === 'agi') {
    return `AI Blind Spots: ${score} reasoning | ${correct}/${total} | AI misses ${beatAi}\n${sharePattern(answers)}\niq.on.recursiv.io`;
  }
  return `Daily Sprint: ${score} reasoning | ${rank} | ${correct}/${total}\n${sharePattern(answers)}\niq.on.recursiv.io`;
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

function Leaderboard({ entries, onUnlock }: { entries: LeaderboardEntry[]; onUnlock: () => void }) {
  return (
    <section className="leaderboard" id="rankings">
      <div className="section-head">
        <div>
          <p className="kicker">Founding rank board</p>
          <h2>The daily reasoning board opens with verified first attempts.</h2>
          <p>Only the first completed World IQ run each day is submitted. Practice runs and lab modes stay private.</p>
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
            <span>Finish Today&apos;s World IQ to create the first local verified entry.</span>
          </div>
        )}
      </div>
      <p className="trust-note">Ranks are entertainment and competition signals. They are not clinical IQ scores or eligibility for any high-IQ society.</p>
    </section>
  );
}

function Result({
  mode,
  answers,
  onUnlock,
  onLeaderboard,
}: {
  mode: ModeKey;
  answers: AnswerRecord[];
  onUnlock: () => void;
  onLeaderboard: (entry: LeaderboardEntry) => void;
}) {
  const [shareState, setShareState] = React.useState('Share result');
  const [resultStatus, setResultStatus] = React.useState<'pending' | 'official' | 'practice' | 'daily' | 'lab'>('pending');
  const submittedRef = React.useRef(false);
  const correct = answers.filter((answer) => answer.correct).length;
  const total = answers.length;
  const percentile = percentileFromScore(correct, total);
  const score = worldIqScore(correct, total);
  const rank = formatRank(percentile);
  const beatAi = answers.filter((answer) => answer.correct && !answer.aiSolved).length;
  const officialWorldRun = mode === 'world' && total >= 6;
  const shareText = buildShareText({ mode, score, rank, percentile, correct, total, beatAi, answers, status: resultStatus });

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
      timestamp: Date.now(),
    };
    writeOfficialRank(officialRank);
    setResultStatus('official');

    const entry: LeaderboardEntry = {
      id: `official-${localDayKey()}`,
      name: 'You',
      score,
      mode: 'Today\'s World IQ',
      accuracy: `${correct}/${total}`,
      qualifier: beatAi > 0 ? `${beatAi} AI misses beaten` : 'official daily rank',
      timestamp: Date.now(),
      local: true,
    };
    saveLeaderboardEntry(entry);
    onLeaderboard(entry);
  }, [beatAi, correct, mode, officialWorldRun, onLeaderboard, percentile, rank, score, total]);

  async function share() {
    try {
      await navigator.clipboard.writeText(shareText);
      setShareState('Copied');
    } catch {
      setShareState('Ready');
    }
  }

  const statusCopy = resultStatus === 'official'
    ? {
      kicker: 'Official rank locked',
      title: 'Your first World IQ result today is on the founding board.',
      body: `${score} reasoning score. ${rank} estimated daily rank. ${beatAi} AI blind-spot answers.`,
    }
    : resultStatus === 'practice'
      ? {
        kicker: 'Practice result',
        title: 'Today\'s official rank is already locked.',
        body: 'Retakes are useful for training, but they do not replace the first completed World IQ result.',
      }
      : resultStatus === 'daily'
        ? {
          kicker: 'Daily sprint logged',
          title: 'Warmup complete.',
          body: 'Daily Sprint builds the habit. Complete Today\'s World IQ to lock an official rank.',
        }
        : {
          kicker: 'AI lab complete',
          title: 'Blind-spot run complete.',
          body: `${beatAi} answers landed on puzzles current model baselines often miss.`,
        };

  return (
    <div className="runner-panel result">
      <p className="kicker">{statusCopy.kicker}</p>
      <div className="result-top">
        <div>
          <strong className="score">{score}</strong>
          <span>Reasoning score</span>
        </div>
        <div className="rank-card">
          <strong>{rank}</strong>
          <span>estimated rank</span>
        </div>
      </div>
      <div className="stats three">
        <div><strong>{correct}/{total}</strong><span>correct</span></div>
        <div><strong>{percentile}%</strong><span>percentile</span></div>
        <div><strong>{beatAi}</strong><span>AI misses beaten</span></div>
      </div>
      <div className="share-card">
        <div>
          <strong>{mode === 'world' ? `World IQ ${localDayKey()}` : modes[mode].label}</strong>
          <span>{correct}/{total} correct · {beatAi} AI misses</span>
        </div>
        <div className="share-pattern" aria-label="Result pattern" style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}>
          {answers.map((answer) => (
            <span key={answer.id} className={answer.correct ? 'hit' : 'miss'} />
          ))}
        </div>
        <p>{shareText}</p>
      </div>
      <div className={`qualification ${resultStatus === 'official' ? 'qualified' : ''}`}>
        <strong>{statusCopy.title}</strong>
        <span>{statusCopy.body}</span>
      </div>
      <p className="trust-note">World IQ is a competitive visual reasoning game, not a clinical IQ test, admission test, or supervised psychometric assessment.</p>
      <div className="actions">
        <button className="primary" onClick={share}>{shareState}</button>
        <button className="secondary" onClick={onUnlock}>Save rank</button>
        <button className="secondary" onClick={onUnlock}>Unlock archive</button>
      </div>
    </div>
  );
}

function Runner({
  mode,
  startRequest,
  isPaid,
  onUnlock,
  onLeaderboard,
}: {
  mode: ModeKey;
  startRequest: number;
  isPaid: boolean;
  onUnlock: () => void;
  onLeaderboard: (entry: LeaderboardEntry) => void;
}) {
  const [started, setStarted] = React.useState(true);
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [answers, setAnswers] = React.useState<AnswerRecord[]>([]);
  const [playUsage, setPlayUsage] = React.useState<PlayUsage>(() => blankPlayUsage());
  const [chargedAttempt, setChargedAttempt] = React.useState(false);
  const questions = React.useMemo(() => getQuestions(mode), [mode]);
  const complete = started && step >= questions.length;
  const current = complete ? questions[questions.length - 1] : questions[step];
  const remainingToday = playsRemaining(playUsage);

  React.useEffect(() => {
    const usage = readPlayUsage();
    setPlayUsage(usage);
    setStarted(isPaid || playsRemaining(usage) > 0);
  }, [isPaid]);
  React.useEffect(() => {
    const usage = readPlayUsage();
    setPlayUsage(usage);
    setStarted(isPaid || playsRemaining(usage) > 0);
    setStep(0);
    setSelected(null);
    setAnswers([]);
    setChargedAttempt(false);
  }, [isPaid, mode]);

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
    setChargedAttempt(false);
  }

  React.useEffect(() => {
    if (startRequest > 0) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  function lockAnswer() {
    if (selected === null || complete || !current) return;
    if (!isPaid && !chargedAttempt) {
      setPlayUsage(consumePlay());
      setChargedAttempt(true);
    }
    setAnswers((existing) => [...existing, {
      id: current.id,
      selected,
      correct: selected === current.answerIndex,
      aiSolved: current.aiSolved,
    }]);
    setSelected(null);
    setStep((value) => value + 1);
  }

  if (!isPaid && !started) {
    return (
      <div className="runner-panel gate">
        <p className="kicker">{modes[mode].label}</p>
        <h2>6 games used today.</h2>
        <p className="free-note">Unlock a paid profile for archive access, private reports, and extra practice, or come back tomorrow.</p>
        <button className="primary full" onClick={onUnlock}>Unlock archive</button>
      </div>
    );
  }

  if (complete) return <Result mode={mode} answers={answers} onUnlock={onUnlock} onLeaderboard={onLeaderboard} />;

  return (
    <div className="runner-panel">
      <div className="progress-row">
        <p className="kicker">{modes[mode].label}</p>
        <span>{step + 1}/{questions.length} · {isPaid ? 'Unlimited' : `${remainingToday}/${DAILY_PLAY_LIMIT} left`}</span>
      </div>
      <div className="track"><div style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      <div className="question-head">
        <h2>{current.title}</h2>
        <span>{current.difficulty}</span>
      </div>
      <p className="prompt">{current.prompt}</p>
      <div className="matrix">
        {current.matrix.map((item, index) => <PatternTileView key={`${current.id}-${index}`} tile={item} />)}
      </div>
      <div className="options">
        {current.options.map((item, index) => (
          <button key={`${current.id}-${index}`} aria-label={`Answer ${index + 1}`} className={`option ${selected === index ? 'active' : ''}`} onClick={() => setSelected(index)}>
            <PatternTileView tile={item} selected={selected === index} />
            <span>{String.fromCharCode(65 + index)}</span>
          </button>
        ))}
      </div>
      <div className="answer-footer">
        <p>{current.aiSolved ? 'Frontier models usually solve this.' : 'Frontier models often miss this pattern.'}</p>
        <button className="primary" disabled={selected === null} onClick={lockAnswer}>Lock answer</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = React.useState<ModeKey>('world');
  const [view, setView] = React.useState<ViewKey>('test');
  const startRequest = 0;
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>(seededLeaderboard);
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [paidAccess, setPaidAccess] = React.useState(false);
  const [checkoutState, setCheckoutState] = React.useState<'idle' | 'opening' | 'verifying' | 'active' | 'error'>('idle');
  const [checkoutError, setCheckoutError] = React.useState('');

  React.useEffect(() => {
    setLeaderboard(getLeaderboardEntries());
    setPaidAccess(readPaidAccess());
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function refreshAccess() {
      try {
        const response = await fetch('/api/access', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok && data?.active) {
          setPaidAccess(true);
          savePaidAccess({ active: true, subscriptionId: data.subscriptionId ?? null });
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
    const sessionId = params.get('session_id');

    async function verifyCheckout(session: string) {
      setUnlockOpen(true);
      setCheckoutState('verifying');
      setCheckoutError('');
      try {
        const response = await fetch(`/api/checkout-status?session_id=${encodeURIComponent(session)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.active) {
          throw new Error(data?.error || 'Payment could not be verified yet.');
        }
        savePaidAccess({ active: true, sessionId: session, subscriptionId: data.subscriptionId ?? null });
        setPaidAccess(true);
        setCheckoutState('active');
      } catch (error) {
        setCheckoutState('error');
        setCheckoutError(error instanceof Error ? error.message : 'Payment could not be verified yet.');
      } finally {
        clearCheckoutQuery();
      }
    }

    if (checkout === 'success' && sessionId) {
      verifyCheckout(sessionId);
      return;
    }

    if (checkout === 'cancelled') {
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

  function handleLeaderboard() {
    setLeaderboard(getLeaderboardEntries());
  }

  const checkoutHref = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '';
  const stripeCheckoutHref = getStripeCheckoutHref(checkoutHref);
  const checkoutBusy = checkoutState === 'opening' || checkoutState === 'verifying';

  async function startCheckout() {
    if (checkoutBusy) return;
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
        throw new Error(data?.error || 'Could not open Stripe checkout.');
      }
      window.location.assign(data.url);
    } catch (error) {
      if (stripeCheckoutHref) {
        window.location.assign(stripeCheckoutHref);
        return;
      }
      setCheckoutState('error');
      setCheckoutError(error instanceof Error ? error.message : 'Could not open Stripe checkout.');
    }
  }

  return (
    <main>
      <nav>
        <button className="brand" onClick={() => {
          setMode('world');
          setView('test');
        }}>
          <strong>World IQ</strong>
          <span>iq.on.recursiv.io</span>
        </button>
        <div>
          <button className={view === 'test' && mode === 'world' ? 'active' : ''} onClick={() => openMode('world')}>Today</button>
          <button className={view === 'test' && mode === 'agi' ? 'active' : ''} onClick={() => openMode('agi')}>AI</button>
          <button className={view === 'test' && mode === 'daily' ? 'active' : ''} onClick={() => openMode('daily')}>Sprint</button>
          <button className={view === 'rankings' ? 'active' : ''} onClick={() => setView('rankings')}>Rankings</button>
          <button className={view === 'about' ? 'active' : ''} onClick={() => setView('about')}>About</button>
          <button className="nav-cta" onClick={() => setUnlockOpen(true)}>Account</button>
        </div>
      </nav>

      {view === 'test' ? (
        <section className="test-surface" aria-label={`${modes[mode].label} test`}>
          <SignalSculpture />
          <Runner mode={mode} startRequest={startRequest} isPaid={paidAccess} onUnlock={() => setUnlockOpen(true)} onLeaderboard={handleLeaderboard} />
          <aside className="mission-card" aria-label="World IQ subscription">
            <div>
              <span className="edition">( A )</span>
              <span className="sequence">[ 001 / 012 ]</span>
            </div>
            <p>One official daily rank. Six free plays. Paid profiles unlock archive, history, and private reports.</p>
            <button className="secondary micro" onClick={() => setUnlockOpen(true)}>Unlock {UNLIMITED_PRICE_LABEL}</button>
          </aside>
        </section>
      ) : null}

      {view === 'rankings' ? (
        <Leaderboard entries={leaderboard} onUnlock={() => setUnlockOpen(true)} />
      ) : null}

      {view === 'about' ? (
        <section className="features">
          <div className="section-head">
            <div>
              <p className="kicker">World IQ by Recursiv</p>
              <h2>The daily reasoning rank for humans and AI.</h2>
              <p>A competitive visual reasoning game. Your first completed World IQ run each day creates the official rank and share card.</p>
            </div>
          </div>
          <div className="feature-grid">
            <article><strong>Today&apos;s World IQ</strong><p>A 12-question reasoning run with one official daily submission and a clean share card.</p></article>
            <article><strong>AI Blind Spots</strong><p>Lab puzzles selected because current model baselines often miss the abstraction.</p></article>
            <article><strong>Daily Sprint</strong><p>A one-puzzle warmup for streaks and group chats before the ranked run.</p></article>
          </div>
          <div className="monetization">
            <div><strong>World IQ Unlimited</strong><p>Free players get six plays per day. Paid profiles unlock archive access, saved history, private reasoning reports, and extra practice.</p></div>
            <button className="secondary" onClick={() => setUnlockOpen(true)}>Save profile</button>
          </div>
          <p className="trust-note">World IQ is not a clinical IQ test, admission test, or supervised psychometric assessment.</p>
        </section>
      ) : null}

      {unlockOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Unlock World IQ archive access">
          <div className="modal">
            <button className="close" onClick={() => setUnlockOpen(false)} aria-label="Close">×</button>
            <p className="kicker">World IQ account</p>
            <h2>{paidAccess ? 'Unlimited is active.' : 'Create an account, then unlock the archive.'}</h2>
            <p>{paidAccess
              ? 'Your paid World IQ access is active on this device. Keep building history, practicing, and saving rank cards.'
              : 'Free visitors get six plays per day. Create a Recursiv account for the platform profile, or continue to Stripe for archive access and private reports.'}</p>
            <div className="plans">
              <div><strong>Free</strong><span>6 games per day</span></div>
              <div><strong>{UNLIMITED_PRICE_LABEL}</strong><span>archive + reports + extra practice</span></div>
            </div>
            {paidAccess ? (
              <button className="primary full" onClick={() => setUnlockOpen(false)}>Continue playing</button>
            ) : (
              <div className="stacked-actions">
                <a className="secondary full center-link" href={RECURSIV_SIGNUP_URL}>Create Recursiv account</a>
                <button className="primary full" disabled={checkoutBusy} onClick={startCheckout}>
                  {checkoutState === 'opening' ? 'Opening checkout' : checkoutState === 'verifying' ? 'Verifying payment' : 'Continue to checkout'}
                </button>
              </div>
            )}
            <span className="fine-print">
              {paidAccess
                ? 'Archive access and extra practice are enabled.'
                : `Games-style pricing at ${UNLIMITED_PRICE_LABEL}. Checkout is created securely with Stripe.`}
            </span>
            {checkoutError ? <span className="fine-print error">{checkoutError}</span> : null}
            {checkoutState === 'active' ? <span className="fine-print success">Payment verified. Unlimited is active.</span> : null}
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
        .runner-panel, .leaderboard, .features { border: 1px solid var(--line-strong); border-radius: 26px; background: rgba(244,244,238,.58); padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.42); }
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
        .leaderboard, .features { max-width: 1180px; margin: 16px auto 0; }
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
          .feature-grid { grid-template-columns: 1fr; }
          .leaderboard-row { grid-template-columns: 38px minmax(0, 1fr) 54px; padding: 10px; }
          .leader-score strong { font-size: 21px; }
          .plans { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
