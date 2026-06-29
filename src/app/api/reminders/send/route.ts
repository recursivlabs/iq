import { NextResponse } from 'next/server';
import { readJsonStore } from '../../_lib/store';
import { readReminderStore, updateReminderStore } from '../../_lib/reminders';
import type { ReminderRecord } from '../../_lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_APP_URL = (process.env.IQ_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://iqwars.app').replace(/\/$/, '');
const LEADERBOARD_STORE_KEY = 'world-iq:leaderboards:v2';
const LEADERBOARD_STORE_FILE = 'world-iq-leaderboards.json';

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
};

type LeaderboardStore = {
  entries: SocialEntry[];
};

function sameUtcDay(a: number | null, b: number) {
  if (!a) return false;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 120) : '';
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

async function readLeaderboardEntries() {
  const parsed = await readJsonStore<Partial<LeaderboardStore>>(LEADERBOARD_STORE_KEY, { entries: [] }, LEADERBOARD_STORE_FILE);
  return Array.isArray(parsed.entries) ? parsed.entries.filter(isSocialEntry) : [];
}

function dayStamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayStamp(date.getTime());
}

function bestEntry(entries: SocialEntry[]) {
  return [...entries].sort((a, b) => b.score - a.score || b.beatAi - a.beatAi || (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER) || a.timestamp - b.timestamp)[0] || null;
}

function latestEntry(entries: SocialEntry[]) {
  return [...entries].sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

function currentStreakDays(entries: SocialEntry[], today: string) {
  const playedDays = new Set(entries.map((entry) => entry.day));
  const startDay = playedDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let cursor = startDay; playedDays.has(cursor); cursor = addDays(cursor, -1)) {
    streak += 1;
  }
  return streak;
}

function buildReminderDigest(reminder: ReminderRecord, entries: SocialEntry[], now: number) {
  const today = dayStamp(now);
  const url = reminder.groupCode ? `${PUBLIC_APP_URL}/g/${reminder.groupCode}` : PUBLIC_APP_URL;
  const room = reminder.groupName || 'IQ WARS';
  const playerEntries = entries.filter((entry) => entry.playerId === reminder.playerId);
  const todayEntry = playerEntries.find((entry) => entry.day === today) || null;
  const streak = currentStreakDays(playerEntries, today);
  const best = bestEntry(playerEntries);
  const latest = latestEntry(playerEntries);
  const roomEntries = reminder.groupCode ? entries.filter((entry) => entry.groupCode === reminder.groupCode && !entry.playerId.startsWith('agent-')) : [];
  const roomToday = roomEntries.filter((entry) => entry.day === today);
  const roomRecord = bestEntry(roomEntries);

  const subject = todayEntry
    ? `${room}: you are on today's IQ board`
    : streak > 0
      ? `${room}: protect your ${streak}-day IQ streak`
      : `${room}: today's IQ WARS is live`;

  const lines = [
    `Today's IQ WARS is live for ${room}.`,
    '',
    todayEntry
      ? `Today: ${todayEntry.score} IQ, ${todayEntry.correct}/${todayEntry.total}, ${todayEntry.rank}.`
      : 'You still have one official attempt today.',
  ];

  if (streak > 0) lines.push(`Streak: ${streak} completed day${streak === 1 ? '' : 's'}. Keep it alive with today's board.`);
  else lines.push('Start a streak today. Your score gets more reliable as your completed days stack up.');

  if (best) lines.push(`Personal best: ${best.score} IQ on ${best.day}.`);
  if (latest && latest.day !== todayEntry?.day) lines.push(`Last result: ${latest.score} IQ on ${latest.day}.`);
  if (reminder.groupCode) {
    lines.push(`Room today: ${roomToday.length} player${roomToday.length === 1 ? '' : 's'} on the board.`);
    if (roomRecord) lines.push(`Room record: ${roomRecord.displayName} ${roomRecord.score} IQ on ${roomRecord.day}.`);
  }
  lines.push('', `Play here: ${url}`, '', 'One official attempt. New board every day.', 'To stop reminders, reply STOP or email bill@recursiv.io.');

  return {
    subject,
    text: lines.join('\n'),
  };
}

async function sendReminder(reminder: ReminderRecord, entries: SocialEntry[], now: number) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const digest = buildReminderDigest(reminder, entries, now);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.IQ_EMAIL_FROM || 'IQ WARS <onboarding@resend.dev>',
      to: reminder.email,
      subject: digest.subject,
      text: digest.text,
    }),
  });
  return response.ok;
}

export async function POST(request: Request) {
  const configuredToken = process.env.IQ_REMINDER_CRON_TOKEN;
  if (!configuredToken && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Reminder cron token is not configured.' }, { status: 503 });
  }
  if (configuredToken) {
    const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (provided !== configuredToken) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const targetEmail = cleanEmail(body?.email);
  if (targetEmail && !validEmail(targetEmail)) {
    return NextResponse.json({ error: 'Invalid proof email.' }, { status: 400 });
  }

  const now = Date.now();
  const store = await readReminderStore();
  const reminders = targetEmail ? store.reminders.filter((reminder) => reminder.email === targetEmail) : store.reminders;
  if (targetEmail && reminders.length === 0) {
    return NextResponse.json({ error: 'No reminder found for proof email.' }, { status: 404 });
  }
  const leaderboardEntries = await readLeaderboardEntries().catch(() => []);
  let sent = 0;
  let skipped = 0;
  const sentIds = new Set<string>();
  for (const reminder of reminders) {
    if (sameUtcDay(reminder.lastSentAt, now)) {
      skipped += 1;
      continue;
    }
    const ok = await sendReminder(reminder, leaderboardEntries, now).catch(() => false);
    if (ok) {
      reminder.lastSentAt = now;
      sentIds.add(reminder.id);
      sent += 1;
    } else {
      skipped += 1;
    }
  }
  if (sentIds.size) {
    await updateReminderStore((current) => {
      for (const reminder of current.reminders) {
        if (sentIds.has(reminder.id)) reminder.lastSentAt = now;
      }
      return null;
    });
  }

  return NextResponse.json({ ok: true, sent, skipped }, {
    headers: { 'cache-control': 'no-store' },
  });
}
