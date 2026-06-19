'use client';

import * as React from 'react';

type ModeKey = 'world' | 'agi' | 'daily';
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

const FREE_PLAY_STORAGE_KEY = 'world-iq-free-play-date';
const LEADERBOARD_STORAGE_KEY = 'world-iq-leaderboard';

const tones: Record<TileTone, string> = {
  ink: '#171717',
  blue: '#315d8c',
  green: '#168466',
  rose: '#b84a6d',
  amber: '#b27821',
};

const modes: Record<ModeKey, { label: string; title: string; body: string; cta: string }> = {
  world: {
    label: 'World IQ',
    title: 'Get your global reasoning rank.',
    body: 'A 12-question visual reasoning test. Everyone gets one free play per day.',
    cta: 'Start World IQ',
  },
  agi: {
    label: 'Human vs AGI',
    title: 'See where humans still beat AI.',
    body: 'Abstraction puzzles selected around model blind spots and human pattern discovery.',
    cta: 'Challenge AGI',
  },
  daily: {
    label: 'Daily Genius',
    title: 'One puzzle. One daily rank.',
    body: 'A short daily puzzle for streaks, group chats, and shareable results.',
    cta: 'Play today',
  },
};

const seededLeaderboard: LeaderboardEntry[] = [
  { id: 'seed-aether', name: 'Aether-01', score: 152, mode: 'Human vs AGI', accuracy: '6/6', qualifier: 'AI-stumper perfect', timestamp: 1 },
  { id: 'seed-lina', name: 'Lina Park', score: 149, mode: 'World IQ', accuracy: '12/12', qualifier: 'elite matrix reasoning', timestamp: 2 },
  { id: 'seed-orion', name: 'Orion Lab', score: 147, mode: 'Human vs AGI', accuracy: '5/6', qualifier: 'model baseline', timestamp: 3 },
  { id: 'seed-mateo', name: 'Mateo Chen', score: 143, mode: 'World IQ', accuracy: '11/12', qualifier: 'top 0.8%', timestamp: 4 },
  { id: 'seed-nova', name: 'Nova Team', score: 138, mode: 'Daily Genius', accuracy: '1/1', qualifier: 'daily leader', timestamp: 5 },
];

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
      difficulty: index < 2 ? 'AGI baseline' : index < 4 ? 'AGI hard' : 'AGI frontier',
      prompt: 'Solve the abstraction before the model does.',
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

function readFreePlayDate() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(FREE_PLAY_STORAGE_KEY);
}

function writeFreePlayDate(dayKey: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FREE_PLAY_STORAGE_KEY, dayKey);
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

function Leaderboard({ entries, onUnlock }: { entries: LeaderboardEntry[]; onUnlock: () => void }) {
  return (
    <section className="leaderboard" id="rankings">
      <div className="section-head">
        <div>
          <p className="kicker">Global intelligence rankings</p>
          <h2>The founding leaderboard for human and AI reasoning.</h2>
          <p>Complete enough questions in World IQ or Human vs AGI to earn a qualified score and enter the global board.</p>
        </div>
        <button className="secondary" onClick={onUnlock}>Verify rank</button>
      </div>
      <div className="leaderboard-rows">
        {entries.map((entry, index) => (
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
        ))}
      </div>
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
  const submittedRef = React.useRef(false);
  const correct = answers.filter((answer) => answer.correct).length;
  const total = answers.length;
  const percentile = percentileFromScore(correct, total);
  const score = worldIqScore(correct, total);
  const rank = formatRank(percentile);
  const beatAi = answers.filter((answer) => answer.correct && !answer.aiSolved).length;
  const qualifies = total >= 6;

  React.useEffect(() => {
    if (!qualifies || submittedRef.current) return;
    submittedRef.current = true;
    const entry: LeaderboardEntry = {
      id: `local-${mode}-${Date.now()}`,
      name: 'You',
      score,
      mode: modes[mode].label,
      accuracy: `${correct}/${total}`,
      qualifier: beatAi > 0 ? `${beatAi} AI misses beaten` : 'qualified score',
      timestamp: Date.now(),
      local: true,
    };
    saveLeaderboardEntry(entry);
    onLeaderboard(entry);
  }, [beatAi, correct, mode, onLeaderboard, qualifies, score, total]);

  async function share() {
    const text = `I scored ${score} on World IQ (${rank}, ${percentile} percentile) and qualified for the intelligence leaderboard.`;
    try {
      await navigator.clipboard.writeText(text);
      setShareState('Copied');
    } catch {
      setShareState('Ready');
    }
  }

  return (
    <div className="runner-panel result">
      <p className="kicker">{mode === 'daily' ? 'Daily result locked' : `${modes[mode].label} complete`}</p>
      <div className="result-top">
        <div>
          <strong className="score">{score}</strong>
          <span>World IQ Score</span>
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
        <strong>Share card</strong>
        <p>{mode === 'daily'
          ? `Daily Genius: ${score} IQ score. ${rank} founding rank.`
          : `World IQ: ${score} IQ score. ${rank} founding rank. ${beatAi} AI-stumper answers.`}</p>
      </div>
      <div className={`qualification ${qualifies ? 'qualified' : ''}`}>
        <strong>{qualifies ? 'Qualified for the global intelligence leaderboard' : 'Daily score logged'}</strong>
        <span>{qualifies ? `Your ${score} World IQ score is now on the founding rankings.` : 'Daily Genius builds streaks; complete World IQ or Human vs AGI for the global board.'}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={share}>{shareState}</button>
        <button className="secondary" onClick={onUnlock}>Save rank</button>
        <button className="secondary" onClick={onUnlock}>Unlock unlimited</button>
      </div>
    </div>
  );
}

function Runner({
  mode,
  setMode,
  startRequest,
  onUnlock,
  onLeaderboard,
}: {
  mode: ModeKey;
  setMode: (mode: ModeKey) => void;
  startRequest: number;
  onUnlock: () => void;
  onLeaderboard: (entry: LeaderboardEntry) => void;
}) {
  const [started, setStarted] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [answers, setAnswers] = React.useState<AnswerRecord[]>([]);
  const [freePlayDate, setFreePlayDate] = React.useState<string | null>(null);
  const questions = React.useMemo(() => getQuestions(mode), [mode]);
  const complete = started && step >= questions.length;
  const current = complete ? questions[questions.length - 1] : questions[step];
  const freePlayUsed = freePlayDate === localDayKey();

  React.useEffect(() => setFreePlayDate(readFreePlayDate()), []);
  React.useEffect(() => {
    setStarted(false);
    setStep(0);
    setSelected(null);
    setAnswers([]);
  }, [mode]);

  function begin() {
    if (freePlayUsed) {
      onUnlock();
      return;
    }
    const today = localDayKey();
    writeFreePlayDate(today);
    setFreePlayDate(today);
    setStarted(true);
    setStep(0);
    setSelected(null);
    setAnswers([]);
  }

  React.useEffect(() => {
    if (startRequest > 0) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  function lockAnswer() {
    if (selected === null || complete || !current) return;
    setAnswers((existing) => [...existing, {
      id: current.id,
      selected,
      correct: selected === current.answerIndex,
      aiSolved: current.aiSolved,
    }]);
    setSelected(null);
    setStep((value) => value + 1);
  }

  if (!started) {
    return (
      <div className="runner-panel">
        <div className="mode-row">
          {(Object.keys(modes) as ModeKey[]).map((key) => (
            <button key={key} className={`mode-button ${mode === key ? 'active' : ''}`} onClick={() => setMode(key)}>
              <span className={`mode-glyph ${key}`} aria-hidden="true" />
              {modes[key].label}
            </button>
          ))}
        </div>
        <div className="runner-intro">
          <div className="runner-icon" aria-hidden="true">
            <span className={`mode-glyph ${mode}`} />
          </div>
          <p className="kicker">{modes[mode].label}</p>
          <h2>{modes[mode].title}</h2>
          <p>{modes[mode].body}</p>
        </div>
        <div className="stats">
          <div><strong>{questions.length}</strong><span>puzzles</span></div>
          <div><strong>{mode === 'daily' ? '24h' : 'rank'}</strong><span>{mode === 'daily' ? 'reset' : 'global estimate'}</span></div>
          <div><strong>AI</strong><span>comparison</span></div>
        </div>
        <p className="free-note">{freePlayUsed
          ? 'Free play used today. Unlock a paid profile for unlimited attempts, or come back tomorrow.'
          : 'One free play resets daily. Paid profiles unlock unlimited attempts and deeper reports.'}</p>
        <button className="primary full" onClick={begin}>{freePlayUsed ? 'Unlock unlimited plays' : modes[mode].cta}</button>
      </div>
    );
  }

  if (complete) return <Result mode={mode} answers={answers} onUnlock={onUnlock} onLeaderboard={onLeaderboard} />;

  return (
    <div className="runner-panel">
      <div className="progress-row">
        <p className="kicker">{modes[mode].label}</p>
        <span>{step + 1}/{questions.length}</span>
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
  const [startRequest, setStartRequest] = React.useState(0);
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>(seededLeaderboard);
  const [unlockOpen, setUnlockOpen] = React.useState(false);

  React.useEffect(() => setLeaderboard(getLeaderboardEntries()), []);

  function startWorld() {
    setMode('world');
    setStartRequest((value) => value + 1);
  }

  function handleLeaderboard() {
    setLeaderboard(getLeaderboardEntries());
  }

  const checkoutHref = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '';

  return (
    <main>
      <nav>
        <div>
          <strong>World IQ</strong>
          <span>iq.on.recursiv.io</span>
        </div>
        <div>
          <button onClick={() => setMode('world')}>Rank</button>
          <button onClick={() => setMode('agi')}>AGI</button>
          <button onClick={() => setMode('daily')}>Daily</button>
          <button className="nav-cta" onClick={() => setUnlockOpen(true)}>Sign in</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">World IQ by Recursiv</p>
          <h1>The global reasoning test for humans and AI.</h1>
          <p className="lede">Three simple loops: a global IQ-style rank, a human-vs-AGI challenge, and one daily genius puzzle. One free play resets every day.</p>
          <div className="actions">
            <button className="primary" onClick={startWorld}>Start the test</button>
            <button className="secondary" onClick={() => setUnlockOpen(true)}>Create profile</button>
          </div>
          <div className="founding-stats">
            <div><strong>12</strong><span>World IQ puzzles</span></div>
            <div><strong>6</strong><span>AGI stumpers</span></div>
            <div><strong>1</strong><span>free play per day</span></div>
          </div>
        </div>
        <div className="hero-tool">
          <Runner mode={mode} setMode={setMode} startRequest={startRequest} onUnlock={() => setUnlockOpen(true)} onLeaderboard={handleLeaderboard} />
        </div>
      </section>

      <Leaderboard entries={leaderboard} onUnlock={() => setUnlockOpen(true)} />

      <section className="features">
        <div className="section-head">
          <div>
            <p className="kicker">Viral mechanics</p>
            <h2>Simple enough for everyone. Sharp enough for the AGI crowd.</h2>
          </div>
        </div>
        <div className="feature-grid">
          <article><strong>World IQ</strong><p>A fast reasoning score, estimated global rank, and clean share card.</p></article>
          <article><strong>Human vs AGI</strong><p>Puzzles selected because they expose abstraction gaps that current AI systems still struggle with.</p></article>
          <article><strong>Daily Genius</strong><p>A daily free-play reset for streaks, group challenges, and repeat traffic.</p></article>
        </div>
        <div className="monetization">
          <div><strong>Recursiv Stripe ready</strong><p>Everyone gets one free play per day. Paid profiles unlock unlimited attempts, deep reports, verified badges, pro training, and team leaderboards.</p></div>
          <button className="secondary" onClick={() => setUnlockOpen(true)}>Save profile</button>
        </div>
      </section>

      {unlockOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Unlock unlimited World IQ attempts">
          <div className="modal">
            <button className="close" onClick={() => setUnlockOpen(false)} aria-label="Close">×</button>
            <p className="kicker">World IQ account</p>
            <h2>Unlock unlimited attempts.</h2>
            <p>Free visitors get one play per day. Paid World IQ profiles unlock unlimited attempts, saved ranks, AI-stumper history, and daily streaks.</p>
            <div className="plans">
              <div><strong>Free</strong><span>one play per day</span></div>
              <div><strong>$4.99</strong><span>unlimited attempts + deep report</span></div>
            </div>
            {checkoutHref ? (
              <a className="primary full" href={checkoutHref}>Continue to Stripe</a>
            ) : (
              <button className="primary full" disabled>Stripe checkout pending</button>
            )}
            <span className="fine-print">Set NEXT_PUBLIC_STRIPE_PAYMENT_LINK to enable Recursiv Stripe checkout in production.</span>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        :root {
          color-scheme: light;
          --bg: #f7f5f0;
          --ink: #171717;
          --muted: #6f6a61;
          --faint: #989187;
          --line: rgba(23,23,23,.12);
          --line-strong: rgba(23,23,23,.22);
          --panel: #fffdfa;
          --soft: #f1eee7;
          --rose: #b84a6d;
          --green: #168466;
          --amber: #b27821;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, a { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .38; }
        main { min-height: 100vh; padding: 0 22px 56px; }
        nav { max-width: 1180px; margin: 0 auto; padding: 22px 0 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        nav > div:first-child { display: grid; gap: 2px; }
        nav strong { font-size: 18px; }
        nav span { color: var(--faint); font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; }
        nav > div:last-child { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        nav button { border: 0; background: transparent; color: var(--muted); padding: 8px 10px; font-size: 13px; font-weight: 700; border-radius: 6px; }
        .nav-cta, .secondary { border: 1px solid var(--line-strong); background: var(--panel); color: var(--ink); border-radius: 7px; min-height: 44px; padding: 10px 15px; font-weight: 850; }
        .primary { border: 0; background: var(--ink); color: var(--panel); border-radius: 7px; min-height: 44px; padding: 11px 17px; font-weight: 850; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
        .full { width: 100%; }
        .hero { max-width: 1180px; min-height: 660px; margin: 0 auto; padding: 26px 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 490px); align-items: center; gap: 34px; }
        .kicker { color: var(--rose); font-size: 12px; text-transform: uppercase; letter-spacing: 1.6px; font-weight: 900; margin: 0; }
        h1 { font-size: clamp(56px, 7vw, 82px); line-height: .98; margin: 16px 0 0; max-width: 760px; letter-spacing: 0; }
        h2 { font-size: clamp(25px, 4vw, 38px); line-height: 1.14; margin: 10px 0 0; letter-spacing: 0; }
        .lede { max-width: 610px; color: var(--muted); font-size: 18px; line-height: 30px; margin: 22px 0 0; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
        .founding-stats, .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 34px; }
        .founding-stats div, .stats div { border: 1px solid var(--line); background: rgba(255,253,250,.68); border-radius: 8px; padding: 12px 14px; min-width: 0; }
        .founding-stats strong, .stats strong { display: block; font-size: 23px; line-height: 1.1; }
        .founding-stats span, .stats span { display: block; color: var(--muted); font-size: 12px; font-weight: 700; margin-top: 3px; }
        .runner-panel, .leaderboard, .features { border: 1px solid var(--line-strong); border-radius: 8px; background: var(--panel); padding: 18px; }
        .mode-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .mode-button { flex: 1; min-width: 124px; border: 1px solid var(--line); background: var(--soft); border-radius: 7px; padding: 10px 11px; display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; font-weight: 800; }
        .mode-button.active { background: var(--panel); color: var(--ink); border-color: var(--ink); }
        .mode-glyph { width: 22px; height: 22px; flex: 0 0 22px; border: 1px solid currentColor; border-radius: 6px; position: relative; display: inline-block; opacity: .76; }
        .mode-glyph::before, .mode-glyph::after { content: ""; position: absolute; display: block; }
        .mode-glyph.world::before { inset: 5px; border: 2px solid currentColor; border-radius: 999px; }
        .mode-glyph.world::after { left: 7px; right: 7px; bottom: 4px; height: 3px; border-top: 2px solid currentColor; }
        .mode-glyph.agi::before { width: 4px; height: 4px; left: 4px; top: 8px; border-radius: 999px; background: currentColor; box-shadow: 6px 0 0 currentColor, 12px 0 0 currentColor; }
        .mode-glyph.agi::after { left: 4px; right: 4px; bottom: 5px; height: 2px; border-radius: 999px; background: currentColor; }
        .mode-glyph.daily::before { left: 4px; right: 4px; top: 6px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 0 6px 0 currentColor; }
        .mode-glyph.daily::after { width: 3px; height: 3px; left: 5px; top: 3px; border-radius: 1px; background: currentColor; box-shadow: 8px 0 0 currentColor, 0 12px 0 currentColor, 8px 12px 0 currentColor; }
        .runner-intro { text-align: center; padding: 30px 0 22px; }
        .runner-icon { width: 48px; height: 48px; border-radius: 8px; display: grid; place-items: center; margin: 0 auto 16px; border: 1px solid var(--line-strong); background: var(--soft); }
        .runner-intro p:not(.kicker), .free-note, .prompt, .answer-footer p { color: var(--muted); font-size: 14px; line-height: 22px; }
        .free-note { text-align: center; font-weight: 750; margin: 12px 0 0; }
        .progress-row, .question-head, .answer-footer, .section-head, .leaderboard-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .progress-row span { color: var(--muted); font-size: 12px; font-weight: 800; }
        .track { height: 5px; background: var(--soft); border-radius: 5px; overflow: hidden; margin-top: 10px; }
        .track div { height: 100%; background: var(--ink); border-radius: 5px; }
        .question-head { margin-top: 18px; }
        .question-head h2 { font-size: 20px; margin: 0; }
        .question-head span { color: var(--rose); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 900; }
        .matrix { width: 100%; max-width: 260px; margin: 16px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .tile { width: 78px; aspect-ratio: 1; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); position: relative; overflow: hidden; display: grid; place-items: center; }
        .tile.selected { background: #fff; }
        .missing { background: var(--soft); color: var(--faint); font-size: 26px; font-weight: 900; }
        .ring { position: absolute; width: 44%; aspect-ratio: 1; border: 2px solid; border-radius: 999px; opacity: .22; }
        .bars { position: absolute; display: flex; align-items: center; gap: 4px; }
        .bars span { width: 4px; height: 34px; border-radius: 3px; opacity: .74; }
        .dots { width: 50%; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
        .dots span { width: 9px; aspect-ratio: 1; border-radius: 999px; }
        .options { margin-top: 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
        .option { border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 4px; display: grid; justify-items: center; gap: 6px; color: var(--faint); font-size: 11px; font-weight: 900; }
        .option.active { border-color: var(--ink); background: var(--soft); color: var(--ink); }
        .answer-footer { border-top: 1px solid var(--line); padding-top: 14px; margin-top: 16px; }
        .answer-footer p { flex: 1; min-width: 180px; margin: 0; font-size: 12px; line-height: 18px; font-weight: 700; }
        .result-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; }
        .result-top .score { display: block; font-size: 58px; line-height: 64px; }
        .result-top span, .rank-card span, .leader-score span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 900; }
        .rank-card { border: 1px solid var(--line-strong); background: var(--soft); border-radius: 8px; min-width: 126px; padding: 12px 14px; text-align: center; }
        .rank-card strong { font-size: 21px; }
        .three { margin-top: 16px; }
        .share-card { margin-top: 14px; background: var(--ink); color: var(--panel); border-radius: 8px; padding: 14px; }
        .share-card p { margin: 8px 0 0; line-height: 23px; }
        .qualification { margin-top: 14px; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--soft); display: grid; gap: 3px; }
        .qualification.qualified { border-color: rgba(178,120,33,.42); background: rgba(178,120,33,.08); }
        .qualification span { color: var(--muted); font-size: 12px; line-height: 18px; font-weight: 700; }
        .leaderboard, .features { max-width: 1180px; margin: 16px auto 0; }
        .section-head p { color: var(--muted); max-width: 720px; line-height: 24px; }
        .leaderboard-rows { display: grid; gap: 8px; margin-top: 18px; }
        .leaderboard-row { border: 1px solid var(--line); border-radius: 8px; padding: 12px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 70px; align-items: center; gap: 12px; background: rgba(255,253,250,.68); }
        .leaderboard-row.local { border-color: var(--ink); background: #fff; }
        .rank { width: 42px; height: 42px; display: grid; place-items: center; background: var(--soft); border: 1px solid var(--line-strong); border-radius: 7px; font-weight: 900; }
        .leader-copy { display: grid; min-width: 0; }
        .leader-copy span { color: var(--muted); font-size: 12px; line-height: 18px; font-weight: 700; }
        .leader-score { text-align: right; }
        .leader-score strong { display: block; font-size: 24px; line-height: 28px; }
        .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 22px; }
        .feature-grid article { border: 1px solid var(--line); border-radius: 8px; padding: 18px; background: rgba(255,253,250,.72); }
        .feature-grid p, .monetization p { color: var(--muted); line-height: 22px; }
        .monetization { margin-top: 16px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(23,23,23,.28); display: grid; place-items: center; padding: 18px; z-index: 10; }
        .modal { width: min(440px, 100%); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 8px; padding: 18px; position: relative; box-shadow: 0 20px 60px rgba(23,23,23,.18); }
        .close { position: absolute; top: 10px; right: 10px; border: 1px solid var(--line); background: var(--soft); border-radius: 6px; width: 32px; height: 32px; font-size: 20px; }
        .modal p:not(.kicker), .fine-print { color: var(--muted); line-height: 22px; }
        .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
        .plans div { border: 1px solid var(--line); border-radius: 7px; background: var(--soft); padding: 10px; display: grid; gap: 2px; }
        .plans span, .fine-print { font-size: 11px; font-weight: 750; }
        .fine-print { display: block; margin-top: 10px; text-align: center; }
        @media (max-width: 940px) {
          .hero { grid-template-columns: 1fr; min-height: 0; }
          .hero-tool { max-width: 520px; }
        }
        @media (max-width: 620px) {
          main { padding-inline: 22px; }
          nav { align-items: flex-start; padding-top: 22px; }
          h1 { font-size: 58px; }
          .lede { font-size: 17px; line-height: 29px; }
          .founding-stats { grid-template-columns: 1fr 1fr; }
          .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .tile { width: min(76px, 22vw); }
          .feature-grid { grid-template-columns: 1fr; }
          .leaderboard-row { grid-template-columns: 38px minmax(0, 1fr) 54px; padding: 10px; }
          .leader-score strong { font-size: 21px; }
          .plans { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
