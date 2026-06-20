const BOARD_DAY_SKEW_DAYS = 1;
const DAY_MS = 86_400_000;

export function serverDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dayNumber(day: string) {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

export function sanitizeBoardDay(value: unknown, now = new Date()) {
  const fallback = serverDayKey(now);
  const raw = typeof value === 'string' && value.trim() ? value.trim().slice(0, 10) : fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (serverDayKey(new Date(`${raw}T00:00:00.000Z`)) !== raw) return null;

  const requested = dayNumber(raw);
  const current = dayNumber(fallback);
  if (requested === null || current === null) return null;
  return Math.abs(requested - current) <= BOARD_DAY_SKEW_DAYS ? raw : null;
}
