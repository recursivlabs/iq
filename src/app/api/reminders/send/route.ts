import { NextResponse } from 'next/server';
import { readReminderStore, updateReminderStore } from '../../_lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_APP_URL = (process.env.IQ_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://iqwars.app').replace(/\/$/, '');

function sameUtcDay(a: number | null, b: number) {
  if (!a) return false;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

async function sendReminder(email: string, groupCode: string | null, groupName: string | null) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const url = groupCode ? `${PUBLIC_APP_URL}/g/${groupCode}` : PUBLIC_APP_URL;
  const room = groupName || 'IQ WARS';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.IQ_EMAIL_FROM || 'IQ WARS <onboarding@resend.dev>',
      to: email,
      subject: `${room}: today's IQ WARS is live`,
      text: `Today's IQ WARS is live for ${room}.\n\nPlay here: ${url}\n\nOne official attempt. New board every day.`,
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

  const now = Date.now();
  const store = await readReminderStore();
  let sent = 0;
  let skipped = 0;
  const sentIds = new Set<string>();
  for (const reminder of store.reminders) {
    if (sameUtcDay(reminder.lastSentAt, now)) {
      skipped += 1;
      continue;
    }
    const ok = await sendReminder(reminder.email, reminder.groupCode, reminder.groupName).catch(() => false);
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
