import { readJsonStore, updateJsonStore } from './store';

export type ReminderRecord = {
  id: string;
  email: string;
  playerId: string;
  groupCode: string | null;
  groupName: string | null;
  createdAt: number;
  lastSentAt: number | null;
};

export type ReminderStore = {
  reminders: ReminderRecord[];
};

const REMINDER_STORE_KEY = 'world-iq:reminders:v1';
const REMINDER_STORE_FILE = 'world-iq-reminders.json';

export async function readReminderStore(): Promise<ReminderStore> {
  const parsed = await readJsonStore<Partial<ReminderStore>>(REMINDER_STORE_KEY, { reminders: [] }, REMINDER_STORE_FILE);
  return {
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
  };
}

function normalizeReminderStore(parsed: Partial<ReminderStore>): ReminderStore {
  return {
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
  };
}

export async function updateReminderStore<R>(updater: (store: ReminderStore) => R | Promise<R>) {
  return await updateJsonStore<Partial<ReminderStore>, R>(REMINDER_STORE_KEY, { reminders: [] }, REMINDER_STORE_FILE, async (parsed) => {
    const store = normalizeReminderStore(parsed);
    const result = await updater(store);
    return {
      value: { reminders: store.reminders.slice(-5000) },
      result,
    };
  });
}
