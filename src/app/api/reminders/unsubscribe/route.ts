import { NextResponse, type NextRequest } from 'next/server';
import { updateReminderStore } from '../../_lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanToken(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 64) : '';
}

function html(message: string, status = 200) {
  return new NextResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>IQ WARS reminders</title>
  <style>
    html,body{margin:0;background:#060708;color:#f4f5f6;font-family:Arial,sans-serif}
    main{min-height:100svh;display:grid;place-items:center;padding:24px}
    section{max-width:460px;border:1px solid rgba(255,255,255,.12);background:#0e1012;padding:28px}
    p{color:#a8adb1;line-height:1.55}
    a{color:#f4f5f6}
  </style>
</head>
<body><main><section><h1>${message}</h1><p><a href="/">Return to IQ WARS</a></p></section></main></body>
</html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const token = cleanToken(request.nextUrl.searchParams.get('t'));
  if (!token) return html('Reminder link is invalid.', 400);
  const disabled = await updateReminderStore((store) => {
    let count = 0;
    const now = Date.now();
    for (const reminder of store.reminders) {
      if (reminder.unsubscribeToken === token) {
        reminder.disabledAt = now;
        count += 1;
      }
    }
    return count;
  });
  return disabled > 0
    ? html('IQ WARS reminders are off.')
    : html('Reminder link is expired or already removed.', 404);
}

