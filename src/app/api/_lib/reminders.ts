import { readJsonStore, updateJsonStore } from './store';

export type ReminderRecord = {
  id: string;
  email: string;
  playerId: string;
  groupCode: string | null;
  groupName: string | null;
  createdAt: number;
  lastSentAt: number | null;
  confirmationSentAt: number | null;
};

export type ReminderStore = {
  reminders: ReminderRecord[];
};

const REMINDER_STORE_KEY = 'world-iq:reminders:v1';
const REMINDER_STORE_FILE = 'world-iq-reminders.json';
const MAX_REMINDERS = 5000;

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 120) : '';
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanText(value: unknown, max = 80) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanGroupCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function cleanTimestamp(value: unknown, fallback: number | null) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : fallback;
}

function normalizeReminder(value: unknown): ReminderRecord | null {
  if (!value || typeof value !== 'object') return null;
  const reminder = value as Partial<ReminderRecord>;
  const email = cleanEmail(reminder.email);
  if (!validEmail(email)) return null;
  const groupCode = cleanGroupCode(reminder.groupCode) || null;
  const groupName = cleanText(reminder.groupName, 48) || (groupCode ? groupCode : null);
  const playerId = cleanText(reminder.playerId, 80) || `email:${email}`;
  return {
    id: `${email}:${groupCode || 'global'}`,
    email,
    playerId,
    groupCode,
    groupName,
    createdAt: cleanTimestamp(reminder.createdAt, Date.now()) || Date.now(),
    lastSentAt: cleanTimestamp(reminder.lastSentAt, null),
    confirmationSentAt: cleanTimestamp(reminder.confirmationSentAt, null),
  };
}

export async function readReminderStore(): Promise<ReminderStore> {
  const parsed = await readJsonStore<Partial<ReminderStore>>(REMINDER_STORE_KEY, { reminders: [] }, REMINDER_STORE_FILE);
  return normalizeReminderStore(parsed);
}

function normalizeReminderStore(parsed: Partial<ReminderStore>): ReminderStore {
  const unique = new Map<string, ReminderRecord>();
  if (Array.isArray(parsed.reminders)) {
    for (const reminder of parsed.reminders) {
      const normalized = normalizeReminder(reminder);
      if (normalized) unique.set(normalized.id, normalized);
    }
  }
  return {
    reminders: [...unique.values()].slice(-MAX_REMINDERS),
  };
}

export async function updateReminderStore<R>(updater: (store: ReminderStore) => R | Promise<R>) {
  return await updateJsonStore<Partial<ReminderStore>, R>(REMINDER_STORE_KEY, { reminders: [] }, REMINDER_STORE_FILE, async (parsed) => {
    const store = normalizeReminderStore(parsed);
    const result = await updater(store);
    return {
      value: { reminders: store.reminders.slice(-MAX_REMINDERS) },
      result,
    };
  });
}
