import { Capacitor } from '@capacitor/core';

import { CapacitorScheduleNotificationAdapter } from './capacitor-schedule-notification.adapter';
import { NoopScheduleNotificationAdapter } from './noop-schedule-notification.adapter';
import type { ScheduleNotificationAdapter } from './schedule-notification.adapter';

/** Picks the live Capacitor adapter on native; noop elsewhere (browser, Vitest). */
export function createScheduleNotificationAdapter(): ScheduleNotificationAdapter {
  if (Capacitor.isNativePlatform()) {
    return new CapacitorScheduleNotificationAdapter();
  }
  return new NoopScheduleNotificationAdapter();
}
