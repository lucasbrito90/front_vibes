/**
 * Adapter interface for schedule local notifications.
 * The real implementation delegates to @capacitor/local-notifications on native.
 * The noop implementation is used in Vitest and on the web.
 */

/** Extra payload attached to each schedule notification. Sent in the tap action. */
export interface ScheduleNotificationExtra {
  schedule_id: number;
  vibe_id: number;
  schedule_name: string;
  /**
   * ADR-010 occurrence key (`{schedule_id}:{scheduled_for_unix}`) for the
   * notification's target execution. Used by Phase 11 ack endpoint.
   * Optional for backward-compatibility with notifications scheduled before
   * Phase 11 was deployed.
   */
  occurrence_key?: string;
}

export interface NotificationToSchedule {
  /** Stable per-schedule integer id (= schedule.id). */
  id: number;
  title: string;
  body: string;
  scheduleAt: Date;
  channelId: string;
  extra: ScheduleNotificationExtra;
}

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

export interface ScheduleNotificationAdapter {
  /** True only when running on a supported native platform. */
  isAvailable(): boolean;

  checkPermissions(): Promise<NotificationPermission>;
  requestPermissions(): Promise<NotificationPermission>;

  /** Create (or update) the Android notification channel. No-op on non-Android. */
  createChannel(id: string, name: string): Promise<void>;

  schedule(notifications: NotificationToSchedule[]): Promise<void>;
  cancel(ids: number[]): Promise<void>;

  /** Register a handler called when the user taps a schedule notification. */
  addTapListener(handler: (extra: ScheduleNotificationExtra) => void): Promise<void>;
  removeAllListeners(): Promise<void>;
}
