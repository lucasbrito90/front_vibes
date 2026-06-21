/**
 * Registers the schedule notification tap handler once for the app lifetime.
 * Call from App.vue setup so the listener is always active regardless of route.
 *
 * Tap behaviour (ADR-011):
 * - Navigate to /vibes/:vibe_id/player — user must press Play manually.
 * - No auto-play on cold start.
 * - Phase 11: best-effort ack if online and occurrence_key is present.
 */

import { useRouter } from 'vue-router';

import { scheduleExecutionService } from '@/services/schedule-execution.service';
import {
  scheduleNotificationService,
  type ScheduleNotificationExtra,
} from '@/services/schedule-notification.service';
import { isDeviceOffline } from '@/services/schedule.service';

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

    // Phase 11: best-effort ack — fire-and-forget, never blocks navigation.
    // Skipped when offline or when occurrence_key is absent (pre-Phase-11 notification).
    if (extra.occurrence_key != null && !isDeviceOffline()) {
      void scheduleExecutionService
        .acknowledgeScheduleExecution(extra.schedule_id, extra.occurrence_key)
        .catch(() => {
          // Intentional: ack is best-effort — ignore network / server errors.
        });
    }
  });
}

/** Vitest only — reset singleton so tests can re-register the tap handler. */
export function _resetInitializedForTest(): void {
  _initialized = false;
}
