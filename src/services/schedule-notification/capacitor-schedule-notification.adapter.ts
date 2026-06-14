import { LocalNotifications } from '@capacitor/local-notifications';

import type {
  NotificationPermission,
  NotificationToSchedule,
  ScheduleNotificationAdapter,
  ScheduleNotificationExtra,
} from './schedule-notification.adapter';

/** Live adapter — delegates to @capacitor/local-notifications on Android. */
export class CapacitorScheduleNotificationAdapter implements ScheduleNotificationAdapter {
  isAvailable(): boolean {
    return true;
  }

  async checkPermissions(): Promise<NotificationPermission> {
    const status = await LocalNotifications.checkPermissions();
    return mapDisplay(status.display);
  }

  async requestPermissions(): Promise<NotificationPermission> {
    const status = await LocalNotifications.requestPermissions();
    return mapDisplay(status.display);
  }

  async createChannel(id: string, name: string): Promise<void> {
    await LocalNotifications.createChannel({
      id,
      name,
      importance: 4, // IMPORTANCE_HIGH
      visibility: 1, // VISIBILITY_PUBLIC
      vibration: true,
    });
  }

  async schedule(notifications: NotificationToSchedule[]): Promise<void> {
    await LocalNotifications.schedule({
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.scheduleAt },
        extra: n.extra,
        channelId: n.channelId,
        smallIcon: 'ic_stat_ixora',
        iconColor: '#6200EE',
      })),
    });
  }

  async cancel(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  }

  async addTapListener(handler: (extra: ScheduleNotificationExtra) => void): Promise<void> {
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification.extra as ScheduleNotificationExtra | undefined;
      if (extra?.schedule_id != null) {
        handler(extra);
      }
    });
  }

  async removeAllListeners(): Promise<void> {
    await LocalNotifications.removeAllListeners();
  }
}

function mapDisplay(
  display: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied',
): NotificationPermission {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'prompt';
}
