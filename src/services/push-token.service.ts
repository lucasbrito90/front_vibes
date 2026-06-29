/**
 * Push token service — Phase 5.
 *
 * Registers, refreshes, and deactivates the Android FCM device token with the
 * Laravel backend (POST /api/push-tokens, POST /api/push-tokens/refresh,
 * DELETE /api/push-tokens/{id}).
 *
 * Hard boundaries (ADR-018, ADR-021):
 * - Android native only — all public functions are no-ops on web/browser.
 * - Full FCM token is NEVER logged or stored; only the backend-returned id and
 *   token_preview are persisted in Capacitor Preferences.
 * - Registration and deactivation failures are non-fatal: they must not block
 *   login, navigation, or logout.
 * - No FCM sending, PushProvider, PushNotificationJob, Scheduler, or Smart
 *   Home logic lives here.
 *
 * Stored Preferences keys:
 *   ixora_push_token_id_v1          — numeric backend id (string-encoded)
 *   ixora_push_token_value_preview_v1 — truncated preview for debug only
 *
 * References: ADR-017, ADR-018, ADR-021, spec.md §7, tasks.md P5-1 to P5-7.
 */

import { Preferences } from '@capacitor/preferences';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch } from './laravel-http';
import { isFcmAvailable, requestFcmPermission, getFcmToken } from './fcm-token.service';

// ── Preferences keys ──────────────────────────────────────────────────────────

export const PUSH_TOKEN_ID_PREFS_KEY = 'ixora_push_token_id_v1';
export const PUSH_TOKEN_PREVIEW_PREFS_KEY = 'ixora_push_token_value_preview_v1';

// ── API types ─────────────────────────────────────────────────────────────────

export interface PushTokenPayload {
  token: string;
  platform: 'android';
  provider: 'fcm';
  device_id?: string;
  app_version?: string;
  device_model?: string;
}

export interface RefreshPushTokenPayload {
  new_token: string;
  /** Omitted intentionally — full token is never stored (ADR-021). */
  old_token?: string;
  platform: 'android';
  provider: 'fcm';
}

export interface PushTokenResponse {
  id: number;
  platform: string;
  provider: string;
  device_id: string | null;
  app_version: string | null;
  device_model: string | null;
  is_active: boolean;
  token_preview: string;
  created_at: string | null;
  updated_at: string | null;
}

// ── Auth headers ──────────────────────────────────────────────────────────────

async function authHeaders(): Promise<HeadersInit> {
  const token = await getRequiredIdToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * POST /api/push-tokens
 * Registers a device token with the Laravel backend (upserts by token value).
 */
export async function registerPushToken(payload: PushTokenPayload): Promise<PushTokenResponse> {
  const res = await laravelFetch(laravelApiUrl('/api/push-tokens'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string })?.message ?? `Push token register failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as { data: PushTokenResponse };
  return json.data;
}

/**
 * POST /api/push-tokens/refresh
 * Informs the backend of a rotated FCM token. The old token is intentionally
 * omitted because we do not store the full token (ADR-021); the backend upserts
 * by new_token value.
 */
export async function refreshPushToken(
  payload: RefreshPushTokenPayload,
): Promise<PushTokenResponse> {
  // API contract uses `token` for the new FCM value (spec.md §5 refresh).
  const { new_token, old_token, ...rest } = payload;
  const body = {
    ...rest,
    token: new_token,
    ...(old_token !== undefined ? { old_token } : {}),
  };

  const res = await laravelFetch(laravelApiUrl('/api/push-tokens/refresh'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string })?.message ?? `Push token refresh failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as { data: PushTokenResponse };
  return json.data;
}

/**
 * DELETE /api/push-tokens/{id}
 * Deactivates a specific push token by its backend id.
 */
export async function deactivatePushToken(pushTokenId: number): Promise<void> {
  const res = await laravelFetch(laravelApiUrl(`/api/push-tokens/${pushTokenId}`), {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string })?.message ?? `Push token deactivate failed: ${res.status}`,
    );
  }
}

// ── Preferences helpers ───────────────────────────────────────────────────────

async function getStoredPushTokenId(): Promise<number | null> {
  try {
    const { value } = await Preferences.get({ key: PUSH_TOKEN_ID_PREFS_KEY });
    if (!value) return null;
    const id = parseInt(value, 10);
    return Number.isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

async function savePushTokenPrefs(id: number, tokenPreview: string): Promise<void> {
  await Preferences.set({ key: PUSH_TOKEN_ID_PREFS_KEY, value: String(id) });
  await Preferences.set({ key: PUSH_TOKEN_PREVIEW_PREFS_KEY, value: tokenPreview });
}

async function clearPushTokenPrefs(): Promise<void> {
  await Preferences.remove({ key: PUSH_TOKEN_ID_PREFS_KEY });
  await Preferences.remove({ key: PUSH_TOKEN_PREVIEW_PREFS_KEY });
}

// ── High-level device operations ──────────────────────────────────────────────

/**
 * Request permission, obtain the FCM token, and register it with the backend.
 *
 * Safe to call after every login — the backend upserts by token value.
 * Failures are silently caught so push registration never blocks login
 * or navigation (ADR-018, spec §7).
 */
export async function registerCurrentDevicePushToken(): Promise<void> {
  if (!isFcmAvailable()) {
    console.info('[push-token] FCM unavailable; skipping registration');
    return;
  }

  const granted = await requestFcmPermission();
  if (!granted) {
    console.info('[push-token] Notification permission not granted; skipping registration');
    return;
  }

  const token = await getFcmToken();
  if (!token) {
    console.info('[push-token] FCM token unavailable; skipping registration');
    return;
  }

  console.info('[push-token] Registering device token');
  try {
    const data = await registerPushToken({
      token,
      platform: 'android',
      provider: 'fcm',
    });
    await savePushTokenPrefs(data.id, data.token_preview);
    // Log id and backend preview only — full token is never printed (ADR-021).
    console.info('[push-token] Registered push token', data.id, data.token_preview);
  } catch (err) {
    // Non-fatal: push registration must not block login or navigation.
    console.warn(
      '[push-token] Registration failed (non-fatal):',
      err instanceof Error ? err.message : 'unknown error',
    );
  }
}

/**
 * Deactivate the stored push token on logout.
 *
 * Reads the stored push_token id, calls DELETE /api/push-tokens/{id}, then
 * clears Preferences. Failures are silently caught — deactivation must not
 * block the logout flow (ADR-018, spec §7).
 */
export async function deactivateCurrentDevicePushToken(): Promise<void> {
  try {
    const id = await getStoredPushTokenId();
    if (id !== null) {
      await deactivatePushToken(id);
    }
  } catch {
    // Non-fatal: deactivation must not block logout.
  } finally {
    try {
      await clearPushTokenPrefs();
    } catch {
      // Preferences unavailable — non-fatal.
    }
  }
}

// ── FCM token refresh listener ────────────────────────────────────────────────

let _listenerRegistered = false;

/**
 * Register the FCM `tokenReceived` listener exactly once at app startup.
 *
 * When Firebase rotates the device token (e.g. after app reinstall, token
 * expiry, or security event), the listener fires with the new token and calls
 * POST /api/push-tokens/refresh to keep the backend record current.
 *
 * The old_token is intentionally omitted: we do not store the full token
 * (ADR-021). The backend upserts by new_token value.
 *
 * No-op on web/non-native platforms. Safe to call multiple times — registers
 * the listener only on the first invocation.
 */
export function initPushTokenRefreshListener(): void {
  if (!isFcmAvailable()) return;
  if (_listenerRegistered) return;
  _listenerRegistered = true;

  void FirebaseMessaging.addListener('tokenReceived', (event: { token: string }) => {
    const { token } = event;
    if (!token) return;

    void (async () => {
      try {
        const data = await refreshPushToken({
          new_token: token,
          platform: 'android',
          provider: 'fcm',
          // old_token intentionally omitted — full token is never stored (ADR-021).
        });
        await savePushTokenPrefs(data.id, data.token_preview);
      } catch (err) {
        console.warn(
          '[push-token] Token refresh failed (non-fatal):',
          err instanceof Error ? err.message : 'unknown error',
        );
      }
    })();
  });
}

/** Vitest only — reset singleton so tests can re-register the listener. */
export function _resetListenerForTest(): void {
  _listenerRegistered = false;
}

// ── Public service object ─────────────────────────────────────────────────────

export const pushTokenService = {
  registerPushToken,
  refreshPushToken,
  deactivatePushToken,
  registerCurrentDevicePushToken,
  deactivateCurrentDevicePushToken,
  initPushTokenRefreshListener,
};
