/**
 * Storage adapter for the offline schedule mirror.
 * Native Android uses Capacitor SQLite; tests and non-native builds use in-memory storage.
 */

export const MIRROR_META_OWNER_KEY = 'owner_uid';
export const MIRROR_META_SYNCED_AT_KEY = 'last_synced_at';

export interface ScheduleMirrorRow {
  id: number;
  vibe_id: number;
  name: string;
  timezone: string;
  start_time: string;
  recurrence_type: string;
  recurrence_config: string | null;
  is_enabled: number;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  synced_at: string;
  raw_json: string;
}

export interface ScheduleMirrorDbAdapter {
  initialize(): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  removeMeta(key: string): Promise<void>;
  upsertSchedule(row: ScheduleMirrorRow): Promise<void>;
  replaceAllSchedules(rows: ScheduleMirrorRow[]): Promise<void>;
  listSchedules(): Promise<ScheduleMirrorRow[]>;
  getSchedule(id: number): Promise<ScheduleMirrorRow | null>;
  deleteSchedule(id: number): Promise<void>;
  clearAllSchedules(): Promise<void>;
}

export const SCHEDULES_MIRROR_SCHEMA = `
CREATE TABLE IF NOT EXISTS mirror_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules_mirror (
  id INTEGER PRIMARY KEY NOT NULL,
  vibe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_time TEXT NOT NULL,
  recurrence_type TEXT NOT NULL,
  recurrence_config TEXT NULL,
  is_enabled INTEGER NOT NULL,
  next_run_at TEXT NULL,
  last_run_at TEXT NULL,
  created_at TEXT NULL,
  updated_at TEXT NULL,
  synced_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
`;
