/**
 * Push notification tap handler — Phase 9.
 *
 * Routes the application when the user taps an FCM notification. This service
 * ONLY decides where the app navigates after a tap. It does not create, send,
 * or display notifications, and contains no Scheduler or Smart Home logic.
 *
 * Decision is based exclusively on `notification.data.type`. Titles and bodies
 * are never inspected.
 *
 * Supported notification types (Phase 8 / 8.5 payload builders):
 *   schedule_execution_failed       → /schedules
 *   smart_home_action_failed        → /devices
 *   smart_home_provider_unreachable → /devices
 *   account_security_notice         → /settings
 *
 * The single `notificationActionPerformed` listener covers every tap scenario:
 *   - foreground tap   (app already open)
 *   - background tap   (app resumed from background)
 *   - cold start       (app launched by the tap; navigation gated on router ready)
 *
 * Hard boundaries (ADR-021):
 * - Android native only — no-op on web/browser.
 * - Navigation uses Vue Router `router.push()` only — never window.location, never reload.
 * - Logs only the notification type, resolved route, and timestamp.
 *   The FCM token, payload body, user data, and credentials are NEVER logged.
 *
 * References: ADR-019 (event taxonomy), ADR-021 (privacy), spec.md §8.
 */

import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import type { Router } from 'vue-router';

// ── Navigation mapping ──────────────────────────────────────────────────────────

/**
 * Maps a notification `data.type` to its destination route.
 *
 * Routes are the existing authenticated tab routes (the app mounts them flat
 * under `/`, e.g. `/schedules`, not `/tabs/schedules`). Reusing the existing
 * router means no new routes are introduced by this phase.
 */
export const ROUTE_BY_NOTIFICATION_TYPE: Readonly<Record<string, string>> = {
  schedule_execution_failed: '/schedules',
  smart_home_action_failed: '/devices',
  smart_home_provider_unreachable: '/devices',
  account_security_notice: '/settings',
};

// ── Internal helpers ────────────────────────────────────────────────────────────

function isAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Safely extract `data.type` from a notification payload.
 * Returns undefined when data is missing or type is not a string.
 */
function extractNotificationType(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  const type = (data as Record<string, unknown>).type;
  return typeof type === 'string' ? type : undefined;
}

/** Resolve the destination route for a notification type, or null if unsupported. */
export function resolveRouteForType(type: string | undefined): string | null {
  if (!type) return null;
  return ROUTE_BY_NOTIFICATION_TYPE[type] ?? null;
}

/**
 * Navigate to the route for the given notification type.
 *
 * Waits for the router to be ready before pushing so cold-start taps navigate
 * without a race condition. Unknown/missing types are logged and ignored.
 */
async function navigateForType(router: Router, type: string | undefined): Promise<void> {
  const route = resolveRouteForType(type);

  if (route === null) {
    console.warn('[push-tap] Unknown notification type — ignoring.', {
      type: type ?? null,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Resolves immediately when routing is already bootstrapped (foreground /
  // background) and defers until ready on cold start.
  await router.isReady();
  await router.push(route);

  console.info('[push-tap] Navigated from notification tap.', {
    type,
    route,
    timestamp: new Date().toISOString(),
  });
}

// ── Tap listener (singleton) ────────────────────────────────────────────────────

let _listenerRegistered = false;

/**
 * Register the `notificationActionPerformed` listener exactly once at app
 * startup. The single listener handles foreground tap, background tap, and
 * cold start (the plugin replays the launch intent once the listener attaches).
 *
 * No-op on web/non-native platforms. Safe to call multiple times — registers
 * the listener only on the first invocation.
 */
export function initPushNotificationTapHandler(router: Router): void {
  if (!isAvailable()) return;
  if (_listenerRegistered) return;
  _listenerRegistered = true;

  void FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    const type = extractNotificationType(event?.notification?.data);
    void navigateForType(router, type);
  });
}

/** Vitest only — reset singleton so tests can re-register the listener. */
export function _resetTapHandlerForTest(): void {
  _listenerRegistered = false;
}

// ── Public service object ─────────────────────────────────────────────────────

export const pushNotificationHandlerService = {
  initPushNotificationTapHandler,
  resolveRouteForType,
};
