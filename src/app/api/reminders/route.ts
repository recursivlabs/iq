import { NextResponse } from 'next/server';
import { enforceRateLimit } from '../_lib/rateLimit';
import { reminderUnsubscribeToken, updateReminderStore, type ReminderRecord } from '../_lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_APP_URL = (process.env.IQ_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://iqwars.app').replace(/\/$/, '');

function cleanEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 120);
}

function cleanText(value: unknown, max = 48) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanGroupCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendConfirmation(email: string, groupCode: string | null, groupName: string | null, unsubscribeToken: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const url = groupCode ? `${PUBLIC_APP_URL}/g/${groupCode}` : PUBLIC_APP_URL;
  const offUrl = `${PUBLIC_APP_URL}/api/reminders/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}`;
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
      subject: `${room} is ready for tomorrow`,
      text: `Daily IQ WARS reminder is on for ${room}.\n\nPlay: ${url}\nStop: ${offUrl}`,
    }),
  });
  return response.ok;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = cleanEmail(body?.email);
  if (!validEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }
  const limitedByIp = await enforceRateLimit(request, {
    bucket: 'reminders:post:ip',
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (limitedByIp) return limitedByIp;
  const limitedByEmail = await enforceRateLimit(request, {
    bucket: 'reminders:post:email',
    identity: `email:${email}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (limitedByEmail) return limitedByEmail;

  const now = Date.now();
  const groupCode = cleanGroupCode(body?.groupCode) || null;
  const groupName = cleanText(body?.groupName) || (groupCode ? groupCode : null);
  const playerId = cleanText(body?.playerId, 80) || `email:${email}`;
  const id = `${email}:${groupCode || 'global'}`;
  const unsubscribeToken = reminderUnsubscribeToken(email, groupCode);

  const saveResult = await updateReminderStore((store) => {
    const existingIndex = store.reminders.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? store.reminders[existingIndex] : null;
    const record: ReminderRecord = {
      id,
      email,
      playerId,
      groupCode,
      groupName,
      createdAt: existing?.createdAt || now,
      lastSentAt: existing?.lastSentAt || null,
      confirmationSentAt: existing?.confirmationSentAt || null,
      disabledAt: null,
      unsubscribeToken: existing?.unsubscribeToken || unsubscribeToken,
    };
    if (existingIndex >= 0) {
      store.reminders[existingIndex] = record;
    } else {
      store.reminders.push(record);
    }
    return { shouldSendConfirmation: !record.confirmationSentAt, unsubscribeToken: record.unsubscribeToken };
  });
  const confirmationSent = saveResult.shouldSendConfirmation
    ? await sendConfirmation(email, groupCode, groupName, saveResult.unsubscribeToken || unsubscribeToken).catch(() => false)
    : false;
  if (confirmationSent) {
    await updateReminderStore((store) => {
      const reminder = store.reminders.find((item) => item.id === id);
      if (reminder) reminder.confirmationSentAt = now;
      return null;
    });
  }

  return NextResponse.json({
    ok: true,
    confirmationSent,
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
