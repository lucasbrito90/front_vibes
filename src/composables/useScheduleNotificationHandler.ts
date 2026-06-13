/**
 * Registers the schedule notification tap handler once for the app lifetime.
 * Call from App.vue setup so the listener is always active regardless of route.
 *
 * Tap behaviour (ADR-011):
 * - Navigate to /vibes/:vibe_id/player — user must press Play manually.
 * - No auto-play on cold start.
 */

import { useRouter } from 'vue-router';

import {
  scheduleNotificationService,
  type ScheduleNotificationExtra,
} from '@/services/schedule-notification.service';

let _initialized = false;

export function useScheduleNotificationHandler(): void {
  if (_initialized) return;
  _initialized = true;

  const router = useRouter();

  void scheduleNotificationService.registerTapHandler((extra: ScheduleNotificationExtra) => {
    const path = `/vibes/${extra.vibe_id}/player`;
    // router.isReady() resolves immediately if routing is already bootstrapped,
    // which handles both warm (app in foreground) and cold-start tap scenarios.
    void router.isReady().then(() => {
      void router.push(path);
    });
  });
}
