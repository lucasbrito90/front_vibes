import type {
  NotificationPermission,
  ScheduleNotificationAdapter,
} from './schedule-notification.adapter';

/**
 * No-op adapter used on web/browser and in Vitest.
 * All operations are safe no-ops; `isAvailable()` returns false so the
 * notification service skips all scheduling logic.
 */
export class NoopScheduleNotificationAdapter implements ScheduleNotificationAdapter {
  isAvailable(): boolean {
    return false;
  }

  async checkPermissions(): Promise<NotificationPermission> {
    return 'denied';
  }

  async requestPermissions(): Promise<NotificationPermission> {
    return 'denied';
  }

  async createChannel(): Promise<void> {}

  async schedule(): Promise<void> {}

  async cancel(): Promise<void> {}

  async addTapListener(): Promise<void> {}

  async removeAllListeners(): Promise<void> {}
}
