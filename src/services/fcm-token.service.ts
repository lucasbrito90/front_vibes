/**
 * FCM token utility — Phase 4.
 *
 * Responsible for obtaining an FCM registration token on native Android.
 * Does NOT register the token with the Laravel backend (Phase 5).
 * Does NOT store the token persistently.
 * Does NOT log the full token at any log level.
 *
 * Platform behaviour:
 *   - Native Android → calls @capacitor-firebase/messaging plugin.
 *   - Browser / web → all functions are no-ops that return safe defaults.
 *
 * References: ADR-018, ADR-021, spec.md §7, tasks.md P4-1 to P4-5.
 */

import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';

// ── Token privacy helper ───────────────────────────────────────────────────────

/**
 * Returns a safe truncated preview of an FCM token — never the full value.
 *
 * Mirrors the backend PushToken::tokenPreview() convention:
 *   - Tokens longer than 10 chars → first 6 + "..." + last 4.
 *   - Shorter tokens → "**masked**".
 *
 * Use only for development logging or debug UI. Never log the raw token.
 */
export function fcmTokenPreview(token: string): string {
  if (!token || token.length <= 10) return '**masked**';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// ── Platform guard ─────────────────────────────────────────────────────────────

/**
 * Returns true when running on a native Android or iOS build where the
 * @capacitor-firebase/messaging plugin is available.
 *
 * Always returns false in a browser/web context — all functions below
 * are safe no-ops in that case.
 */
export function isFcmAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

// ── Permission ─────────────────────────────────────────────────────────────────

/**
 * Request push notification permission from the OS.
 *
 * On Android 13+ (API 33+) this prompts for POST_NOTIFICATIONS.
 * On Android < 13 the permission is granted implicitly by the OS and
 * the plugin returns 'granted' without a prompt.
 *
 * Returns:
 *   - `true`  — permission granted.
 *   - `false` — denied, not-determined, or non-native platform.
 *
 * Call before getFcmToken() to ensure permission is obtained first.
 */
export async function requestFcmPermission(): Promise<boolean> {
  if (!isFcmAvailable()) return false;

  try {
    const { receive } = await FirebaseMessaging.requestPermissions();
    return receive === 'granted';
  } catch {
    console.warn('[FCM] requestPermissions threw; treating as denied');
    return false;
  }
}

// ── Token retrieval ───────────────────────────────────────────────────────────

/**
 * Obtain the FCM registration token for the current device.
 *
 * Returns the raw token string to the caller for registration with Laravel
 * (Phase 5). The caller is responsible for keeping the token private and
 * never logging its full value.
 *
 * Returns:
 *   - `string` — the FCM token on success.
 *   - `null`   — on non-native platform, permission not granted, or error.
 *
 * Does NOT store, cache, or log the token.
 */
export async function getFcmToken(): Promise<string | null> {
  if (!isFcmAvailable()) return null;

  try {
    const { token } = await FirebaseMessaging.getToken();
    return token ?? null;
  } catch {
    console.warn('[FCM] getToken threw; treating as null');
    return null;
  }
}

// ── Dev-only verification helper ──────────────────────────────────────────────

/**
 * Development-only helper for manual QA verification of FCM token retrieval.
 *
 * Logs only the token PREVIEW — never the full token.
 * This function is a complete no-op in production builds (import.meta.env.PROD).
 *
 * Usage during manual QA:
 *   import { devVerifyFcmToken } from '@/services/fcm-token.service';
 *   await devVerifyFcmToken(); // check browser console
 *
 * Do not leave calls to this function in committed application code.
 */
export async function devVerifyFcmToken(): Promise<void> {
  if (import.meta.env.PROD) return;

  if (!isFcmAvailable()) {
    console.info('[FCM] Not available on this platform (web/browser).');
    return;
  }

  const granted = await requestFcmPermission();
  if (!granted) {
    console.warn('[FCM] Permission not granted — token not obtainable.');
    return;
  }

  const token = await getFcmToken();
  if (!token) {
    console.warn('[FCM] Token retrieval returned null.');
    return;
  }

  // Log preview only — full token is never printed.
  console.info('[FCM] Token obtained. Preview:', fcmTokenPreview(token));
}

// ── Public service object ─────────────────────────────────────────────────────

export const fcmTokenService = {
  isFcmAvailable,
  requestFcmPermission,
  getFcmToken,
  fcmTokenPreview,
  devVerifyFcmToken,
};
