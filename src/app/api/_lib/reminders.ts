import { readJsonStore, writeJsonStore } from './store';

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

export async function writeReminderStore(store: ReminderStore) {
  await writeJsonStore(REMINDER_STORE_KEY, {
    reminders: store.reminders.slice(-5000),
  }, REMINDER_STORE_FILE);
}
