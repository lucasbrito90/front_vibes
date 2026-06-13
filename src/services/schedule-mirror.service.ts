/**
 * Offline read-only SQLite mirror for schedules (Scheduler MVP Phase 8).
 *
 * Backend Laravel remains source of truth. This layer only receives data from
 * successful API reads / mutations — never from offline UI writes.
 */

import { auth } from '@/services/firebase';
import {
  isDeviceOffline,
  scheduleService,
  type RecurrenceConfig,
  type Schedule,
} from '@/services/schedule.service';
import { waitForFirebaseUser } from '@/services/auth.service';

import { createScheduleMirrorDbAdapter } from './schedule-mirror/create-schedule-mirror-db.adapter';
import {
  MIRROR_META_OWNER_KEY,
  MIRROR_META_SYNCED_AT_KEY,
  type ScheduleMirrorDbAdapter,
  type ScheduleMirrorRow,
} from './schedule-mirror/schedule-mirror-db.adapter';

export const SCHEDULE_OFFLINE_VIEW_MESSAGE =
  'Offline mode: showing cached schedules. Editing is unavailable.';

export const SCHEDULE_OFFLINE_EMPTY_MESSAGE =
  'No cached schedules available. Connect to the internet to sync.';

let adapter: ScheduleMirrorDbAdapter = createScheduleMirrorDbAdapter();
let initPromise: Promise<void> | null = null;

/** Test hook — inject a mock adapter before calling mirror APIs. */
export function setScheduleMirrorDbAdapter(next: ScheduleMirrorDbAdapter): void {
  adapter = next;
  initPromise = null;
}

/** Test hook — restore the default adapter factory. */
export function resetScheduleMirrorDbAdapter(): void {
  adapter = createScheduleMirrorDbAdapter();
  initPromise = null;
}

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = adapter.initialize();
  }
  await initPromise;
}

async function resolveOwnerUid(): Promise<string | null> {
  const user = await waitForFirebaseUser();
  return user?.uid ?? auth.currentUser?.uid ?? null;
}

async function ensureOwnerNamespace(ownerUid: string): Promise<void> {
  await ensureInitialized();
  const stored = await adapter.getMeta(MIRROR_META_OWNER_KEY);
  if (stored && stored !== ownerUid) {
    await adapter.clearAllSchedules();
  }
  await adapter.setMeta(MIRROR_META_OWNER_KEY, ownerUid);
}

async function withOwnerGuard<T>(fn: () => Promise<T>): Promise<T> {
  const ownerUid = await resolveOwnerUid();
  if (!ownerUid) {
    return fn();
  }
  await ensureOwnerNamespace(ownerUid);
  return fn();
}

export function scheduleToMirrorRow(schedule: Schedule, syncedAt: string): ScheduleMirrorRow {
  return {
    id: schedule.id,
    vibe_id: schedule.vibe_id,
    name: schedule.name,
    timezone: schedule.timezone,
    start_time: schedule.start_time ?? '',
    recurrence_type: schedule.recurrence_type,
    recurrence_config: serializeRecurrenceConfig(schedule.recurrence_config),
    is_enabled: schedule.is_enabled ? 1 : 0,
    next_run_at: schedule.next_run_at,
    last_run_at: schedule.last_run_at,
    created_at: schedule.created_at,
    updated_at: schedule.updated_at,
    synced_at: syncedAt,
    raw_json: JSON.stringify(schedule),
  };
}

export function serializeRecurrenceConfig(config: RecurrenceConfig | null): string | null {
  if (!config) return null;
  return JSON.stringify(config);
}

export function deserializeRecurrenceConfig(
  value: string | null,
): RecurrenceConfig | null {
  if (!value) return null;
  return JSON.parse(value) as RecurrenceConfig;
}

export function mirrorRowToSchedule(row: ScheduleMirrorRow): Schedule {
  return JSON.parse(row.raw_json) as Schedule;
}

async function touchSyncedAt(syncedAt: string): Promise<void> {
  await adapter.setMeta(MIRROR_META_SYNCED_AT_KEY, syncedAt);
}

async function initialize(): Promise<void> {
  const ownerUid = await resolveOwnerUid();
  await ensureInitialized();
  if (ownerUid) {
    await ensureOwnerNamespace(ownerUid);
  }
}

async function getLastSyncedAt(): Promise<string | null> {
  await ensureInitialized();
  return adapter.getMeta(MIRROR_META_SYNCED_AT_KEY);
}

async function listFromMirror(): Promise<Schedule[]> {
  return withOwnerGuard(async () => {
    const rows = await adapter.listSchedules();
    return rows.map(mirrorRowToSchedule);
  });
}

async function getFromMirror(id: number): Promise<Schedule | null> {
  return withOwnerGuard(async () => {
    const row = await adapter.getSchedule(id);
    return row ? mirrorRowToSchedule(row) : null;
  });
}

async function upsertFromApi(schedule: Schedule): Promise<void> {
  const syncedAt = new Date().toISOString();
  await withOwnerGuard(async () => {
    await adapter.upsertSchedule(scheduleToMirrorRow(schedule, syncedAt));
    await touchSyncedAt(syncedAt);
  });
}

async function replaceFromApi(schedules: Schedule[]): Promise<void> {
  const syncedAt = new Date().toISOString();
  await withOwnerGuard(async () => {
    const rows = schedules.map((schedule) => scheduleToMirrorRow(schedule, syncedAt));
    await adapter.replaceAllSchedules(rows);
    await touchSyncedAt(syncedAt);
  });
}

async function deleteFromMirror(id: number): Promise<void> {
  await withOwnerGuard(async () => {
    await adapter.deleteSchedule(id);
  });
}

async function clearMirror(): Promise<void> {
  await ensureInitialized();
  await adapter.clearAllSchedules();
  initPromise = null;
}

/**
 * Pull schedules from the API and replace the local mirror (server wins).
 * Only runs when online and authenticated. On failure, leaves prior mirror intact.
 */
async function pullSchedules(): Promise<Schedule[]> {
  if (isDeviceOffline()) {
    throw new Error('Cannot sync schedules while offline.');
  }

  const data = await scheduleService.getSchedules();
  try {
    await replaceFromApi(data);
  } catch (mirrorErr) {
    if (import.meta.env.DEV) {
      console.warn('[ScheduleMirror] API pull succeeded but mirror write failed:', mirrorErr);
    }
  }
  return data;
}

export const scheduleMirrorService = {
  initialize,
  getLastSyncedAt,
  listFromMirror,
  getFromMirror,
  upsertFromApi,
  replaceFromApi,
  deleteFromMirror,
  clearMirror,
  pullSchedules,
};
