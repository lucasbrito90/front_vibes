/**
 * Schedule local notification service — Scheduler MVP Phase 9.
 *
 * Manages Android OS-level schedule reminders derived from the SQLite mirror.
 * All notifications are cancelled + rebuilt after every successful sync so the
 * OS alarm set always reflects the current server-computed `next_run_at`.
 *
 * Hard boundaries (ADR-011):
 * - No FCM / APNs — local notifications only.
 * - No auto-play on cold start — notification is a reminder; user must press Play.
 * - No offline scheduling — new notifications are only registered after online sync.
 * - Graceful degradation when permission is denied.
 * - iOS scheduling: out of MVP (Android first).
 */

import { Preferences } from '@capacitor/preferences';

import type { Schedule } from '@/services/schedule.service';

import { createScheduleNotificationAdapter } from './schedule-notification/create-schedule-notification.adapter';
import type {
  NotificationToSchedule,
  ScheduleNotificationAdapter,
  ScheduleNotificationExtra,
} from './schedule-notification/schedule-notification.adapter';

export type { ScheduleNotificationExtra };

// ── Constants ──────────────────────────────────────────────────────────────────

export const SCHEDULE_NOTIFICATION_CHANNEL_ID = 'schedule_reminders';
export const SCHEDULE_NOTIFICATION_CHANNEL_NAME = 'Schedule Reminders';

/** Preferences key — persists scheduled notification IDs across sessions. */
const PREFS_SCHEDULED_IDS_KEY = 'ixora_scheduled_notification_ids_v1';

export const NOTIFICATION_PERMISSION_DENIED_MESSAGE =
  'Notification permission denied. Schedule reminders are unavailable.';

// ── Adapter (swappable for tests) ─────────────────────────────────────────────

let adapter: ScheduleNotificationAdapter = createScheduleNotificationAdapter();

/** Test hook — inject a mock adapter. Call before any service method. */
export function setScheduleNotificationAdapter(next: ScheduleNotificationAdapter): void {
  adapter = next;
}

/** Test hook — restore the default adapter (real Capacitor or noop). */
export function resetScheduleNotificationAdapter(): void {
  adapter = createScheduleNotificationAdapter();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function loadScheduledIds(): Promise<number[]> {
  try {
    const { value } = await Preferences.get({ key: PREFS_SCHEDULED_IDS_KEY });
    if (!value) return [];
    return JSON.parse(value) as number[];
  } catch {
    return [];
  }
}

async function saveScheduledIds(ids: number[]): Promise<void> {
  await Preferences.set({ key: PREFS_SCHEDULED_IDS_KEY, value: JSON.stringify(ids) });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create the Android notification channel. Call once at app startup.
 * Safe to call on web / non-native — adapter is a no-op there.
 */
async function initialize(): Promise<void> {
  if (!adapter.isAvailable()) return;
  await adapter.createChannel(
    SCHEDULE_NOTIFICATION_CHANNEL_ID,
    SCHEDULE_NOTIFICATION_CHANNEL_NAME,
  );
}

/**
 * Check the current notification permission state.
 * Returns `'denied'` on non-native platforms.
 */
async function checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!adapter.isAvailable()) return 'denied';
  return adapter.checkPermissions();
}

/**
 * Request POST_NOTIFICATIONS permission (Android 13+).
 * Returns `true` when the user grants, `false` otherwise.
 * On non-native platforms always returns `false`.
 */
async function requestPermission(): Promise<boolean> {
  if (!adapter.isAvailable()) return false;
  const result = await adapter.requestPermissions();
  return result === 'granted';
}

/**
 * Cancel all currently scheduled OS notifications for this user and clear the
 * persisted ID list. Call on logout and before each rebuild.
 */
async function cancelAll(): Promise<void> {
  if (!adapter.isAvailable()) return;
  const ids = await loadScheduledIds();
  if (ids.length > 0) {
    await adapter.cancel(ids);
  }
  await saveScheduledIds([]);
}

/**
 * Cancel all existing schedule notifications then re-register from the
 * provided schedule list (idempotent replace strategy from ADR-011).
 *
 * Rules:
 * - Only enabled schedules with a non-null `next_run_at` in the future.
 * - Silent no-op when permission is not granted.
 * - Silent no-op on non-native platforms.
 */
async function rebuildFromMirror(schedules: Schedule[]): Promise<void> {
  if (!adapter.isAvailable()) return;

  const permission = await adapter.checkPermissions();
  if (permission !== 'granted') return;

  const now = Date.now();
  const eligible = schedules.filter(
    (s) => s.is_enabled && s.next_run_at != null && new Date(s.next_run_at).getTime() > now,
  );

  // Always cancel previous set before registering new ones (ADR-011).
  await cancelAll();

  if (eligible.length === 0) return;

  const notifications: NotificationToSchedule[] = eligible.map((s) => ({
    id: s.id,
    title: s.name,
    body: 'Time to start your scheduled vibe.',
    scheduleAt: new Date(s.next_run_at!),
    channelId: SCHEDULE_NOTIFICATION_CHANNEL_ID,
    extra: {
      schedule_id: s.id,
      vibe_id: s.vibe_id,
      schedule_name: s.name,
      // Phase 11: embed occurrence_key so tap handler can ack the execution.
      occurrence_key: `${s.id}:${Math.floor(new Date(s.next_run_at!).getTime() / 1000)}`,
    },
  }));

  await adapter.schedule(notifications);
  await saveScheduledIds(notifications.map((n) => n.id));
}

/**
 * Register the tap-action handler (call once in App.vue setup).
 * The handler receives the `ScheduleNotificationExtra` payload from the tapped
 * notification; caller is responsible for navigation.
 */
async function registerTapHandler(
  onTap: (extra: ScheduleNotificationExtra) => void,
): Promise<void> {
  if (!adapter.isAvailable()) return;
  await adapter.addTapListener(onTap);
}

/** Remove all LocalNotifications listeners. Call on app teardown / logout if needed. */
async function removeAllListeners(): Promise<void> {
  if (!adapter.isAvailable()) return;
  await adapter.removeAllListeners();
}

export const scheduleNotificationService = {
  initialize,
  checkPermission,
  requestPermission,
  cancelAll,
  rebuildFromMirror,
  registerTapHandler,
  removeAllListeners,
};
