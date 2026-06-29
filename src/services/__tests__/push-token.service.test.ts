import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock variables ────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest.
// Use vi.hoisted() so the mock variables are available inside the factories.

const {
  mockIsNativePlatform,
  mockRequestFcmPermission,
  mockGetFcmToken,
  mockGetRequiredIdToken,
  mockLaravelFetch,
  mockPreferencesGet,
  mockPreferencesSet,
  mockPreferencesRemove,
  mockAddListener,
} = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn<[], boolean>().mockReturnValue(false),
  mockRequestFcmPermission: vi.fn<[], Promise<boolean>>().mockResolvedValue(false),
  mockGetFcmToken: vi.fn<[], Promise<string | null>>().mockResolvedValue(null),
  mockGetRequiredIdToken: vi.fn<[], Promise<string>>().mockResolvedValue('mock-id-token'),
  mockLaravelFetch: vi.fn(),
  mockPreferencesGet: vi.fn().mockResolvedValue({ value: null }),
  mockPreferencesSet: vi.fn().mockResolvedValue(undefined),
  mockPreferencesRemove: vi.fn().mockResolvedValue(undefined),
  mockAddListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mockIsNativePlatform },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: mockPreferencesGet,
    set: mockPreferencesSet,
    remove: mockPreferencesRemove,
  },
}));

vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: { addListener: mockAddListener },
}));

vi.mock('@/services/fcm-token.service', () => ({
  isFcmAvailable: mockIsNativePlatform,
  requestFcmPermission: mockRequestFcmPermission,
  getFcmToken: mockGetFcmToken,
}));

vi.mock('@/services/auth.service', () => ({
  getRequiredIdToken: mockGetRequiredIdToken,
}));

vi.mock('@/services/laravel-http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/laravel-http')>();
  return {
    ...actual,
    laravelFetch: mockLaravelFetch,
  };
});

import {
  _resetListenerForTest,
  deactivateCurrentDevicePushToken,
  deactivatePushToken,
  initPushTokenRefreshListener,
  PUSH_TOKEN_ID_PREFS_KEY,
  PUSH_TOKEN_PREVIEW_PREFS_KEY,
  pushTokenService,
  refreshPushToken,
  registerCurrentDevicePushToken,
  registerPushToken,
} from '@/services/push-token.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

const FAKE_TOKEN = 'fcm-test-token-' + 'x'.repeat(120);
const FAKE_TOKEN_PREVIEW = 'fcm-te...xpxy';

function setNative(value: boolean): void {
  mockIsNativePlatform.mockReturnValue(value);
}

function makeOkResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: vi.fn().mockResolvedValue({ data }),
    text: vi.fn().mockResolvedValue(''),
  };
}

function makeErrorResponse(status: number, message = 'Server error') {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ message }),
    text: vi.fn().mockResolvedValue(message),
  };
}

const FAKE_PUSH_TOKEN_RESPONSE = {
  id: 42,
  platform: 'android',
  provider: 'fcm',
  device_id: null,
  app_version: null,
  device_model: null,
  is_active: true,
  token_preview: FAKE_TOKEN_PREVIEW,
  created_at: '2026-06-27T00:00:00.000Z',
  updated_at: '2026-06-27T00:00:00.000Z',
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setNative(false);
  mockGetRequiredIdToken.mockResolvedValue('mock-id-token');
  mockPreferencesGet.mockResolvedValue({ value: null });
  mockPreferencesSet.mockResolvedValue(undefined);
  mockPreferencesRemove.mockResolvedValue(undefined);
  mockAddListener.mockResolvedValue({ remove: vi.fn() });
  _resetListenerForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── registerPushToken ─────────────────────────────────────────────────────────

describe('registerPushToken', () => {
  it('calls POST /api/push-tokens with a Firebase Bearer token', async () => {
    mockGetRequiredIdToken.mockResolvedValue('firebase-bearer-token');
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await registerPushToken({ token: FAKE_TOKEN, platform: 'android', provider: 'fcm' });

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url, init] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer firebase-bearer-token');
  });

  it('does not log the full FCM token', async () => {
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerPushToken({ token: FAKE_TOKEN, platform: 'android', provider: 'fcm' });

    const allOutput = [
      ...consoleSpy.mock.calls.flat(),
      ...infoSpy.mock.calls.flat(),
    ].join(' ');
    expect(allOutput).not.toContain(FAKE_TOKEN);
  });

  it('returns the response data from the backend', async () => {
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    const result = await registerPushToken({
      token: FAKE_TOKEN,
      platform: 'android',
      provider: 'fcm',
    });

    expect(result.id).toBe(42);
    expect(result.token_preview).toBe(FAKE_TOKEN_PREVIEW);
    expect(result.is_active).toBe(true);
  });

  it('throws when backend returns an error', async () => {
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(422, 'Validation failed'));

    await expect(
      registerPushToken({ token: FAKE_TOKEN, platform: 'android', provider: 'fcm' }),
    ).rejects.toThrow('Validation failed');
  });
});

// ── refreshPushToken ──────────────────────────────────────────────────────────

describe('refreshPushToken', () => {
  it('calls POST /api/push-tokens/refresh with a Firebase Bearer token', async () => {
    mockGetRequiredIdToken.mockResolvedValue('firebase-bearer-token');
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await refreshPushToken({ new_token: FAKE_TOKEN, platform: 'android', provider: 'fcm' });

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url, init] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens/refresh');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer firebase-bearer-token');
  });

  it('does not include old_token in the payload when omitted', async () => {
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await refreshPushToken({ new_token: FAKE_TOKEN, platform: 'android', provider: 'fcm' });

    const [, init] = mockLaravelFetch.mock.calls[0];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('old_token');
    expect(body.token).toBe(FAKE_TOKEN);
    expect(body).not.toHaveProperty('new_token');
  });

  it('returns the updated push token response', async () => {
    mockLaravelFetch.mockResolvedValue(makeOkResponse({ ...FAKE_PUSH_TOKEN_RESPONSE, id: 99 }));

    const result = await refreshPushToken({
      new_token: FAKE_TOKEN,
      platform: 'android',
      provider: 'fcm',
    });

    expect(result.id).toBe(99);
  });

  it('throws when backend returns an error', async () => {
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(500, 'Internal error'));

    await expect(
      refreshPushToken({ new_token: FAKE_TOKEN, platform: 'android', provider: 'fcm' }),
    ).rejects.toThrow('Internal error');
  });
});

// ── deactivatePushToken ───────────────────────────────────────────────────────

describe('deactivatePushToken', () => {
  it('calls DELETE /api/push-tokens/{id} with a Firebase Bearer token', async () => {
    mockGetRequiredIdToken.mockResolvedValue('firebase-bearer-token');
    mockLaravelFetch.mockResolvedValue({ ok: true, status: 204, json: vi.fn(), text: vi.fn() });

    await deactivatePushToken(42);

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url, init] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens/42');
    expect(init.method).toBe('DELETE');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer firebase-bearer-token');
  });

  it('throws when backend returns an error', async () => {
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(403, 'Forbidden'));

    await expect(deactivatePushToken(42)).rejects.toThrow('Forbidden');
  });
});

// ── registerCurrentDevicePushToken ────────────────────────────────────────────

describe('registerCurrentDevicePushToken', () => {
  it('is a no-op on web / non-native platforms', async () => {
    setNative(false);

    await registerCurrentDevicePushToken();

    expect(mockRequestFcmPermission).not.toHaveBeenCalled();
    expect(mockGetFcmToken).not.toHaveBeenCalled();
    expect(mockLaravelFetch).not.toHaveBeenCalled();
  });

  it('logs FCM unavailable info when not on native platform', async () => {
    setNative(false);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const output = infoSpy.mock.calls.flat().join(' ');
    expect(output).toContain('[push-token]');
    expect(output).toContain('FCM unavailable');
  });

  it('is a no-op when permission is denied', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(false);

    await registerCurrentDevicePushToken();

    expect(mockGetFcmToken).not.toHaveBeenCalled();
    expect(mockLaravelFetch).not.toHaveBeenCalled();
  });

  it('logs permission not granted info when permission is denied', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(false);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const output = infoSpy.mock.calls.flat().join(' ');
    expect(output).toContain('[push-token]');
    expect(output).toContain('permission not granted');
  });

  it('is a no-op when getFcmToken returns null', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(null);

    await registerCurrentDevicePushToken();

    expect(mockLaravelFetch).not.toHaveBeenCalled();
  });

  it('logs FCM token unavailable info when token is null', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(null);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const output = infoSpy.mock.calls.flat().join(' ');
    expect(output).toContain('[push-token]');
    expect(output).toContain('token unavailable');
  });

  it('calls POST /api/push-tokens with Firebase Bearer token on success', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockGetRequiredIdToken.mockResolvedValue('firebase-bearer-token');
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await registerCurrentDevicePushToken();

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url, init] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer firebase-bearer-token');
  });

  it('stores the returned push_token id in Preferences', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await registerCurrentDevicePushToken();

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: PUSH_TOKEN_ID_PREFS_KEY,
      value: '42',
    });
  });

  it('stores the token_preview (not the full token) in Preferences', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    await registerCurrentDevicePushToken();

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: PUSH_TOKEN_PREVIEW_PREFS_KEY,
      value: FAKE_TOKEN_PREVIEW,
    });

    // Full token must never be stored.
    const allPrefsValues = mockPreferencesSet.mock.calls
      .map((args) => (args[0] as { value: string }).value)
      .join('');
    expect(allPrefsValues).not.toContain(FAKE_TOKEN);
  });

  it('does not throw when backend registration fails', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(500, 'Backend error'));

    await expect(registerCurrentDevicePushToken()).resolves.toBeUndefined();
  });

  it('does not throw when laravelFetch itself rejects', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockRejectedValue(new Error('Network error'));

    await expect(registerCurrentDevicePushToken()).resolves.toBeUndefined();
  });

  it('logs a safe warning (not full token) on failure', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(500, 'Server down'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const allWarnOutput = warnSpy.mock.calls.flat().join(' ');
    expect(allWarnOutput).toContain('[push-token]');
    expect(allWarnOutput).not.toContain(FAKE_TOKEN);
  });

  it('logs Registering device token before calling POST', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const infoOutput = infoSpy.mock.calls.flat().join(' ');
    expect(infoOutput).toContain('[push-token]');
    expect(infoOutput).toContain('Registering device token');
  });

  it('logs Registered push token with id and preview on success', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const infoOutput = infoSpy.mock.calls.flat().join(' ');
    expect(infoOutput).toContain('Registered push token');
    expect(infoOutput).toContain(String(FAKE_PUSH_TOKEN_RESPONSE.id));
    expect(infoOutput).toContain(FAKE_TOKEN_PREVIEW);
  });

  it('does not log full token in success log', async () => {
    setNative(true);
    mockRequestFcmPermission.mockResolvedValue(true);
    mockGetFcmToken.mockResolvedValue(FAKE_TOKEN);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await registerCurrentDevicePushToken();

    const allOutput = infoSpy.mock.calls.flat().join(' ');
    expect(allOutput).not.toContain(FAKE_TOKEN);
  });
});

// ── deactivateCurrentDevicePushToken ──────────────────────────────────────────

describe('deactivateCurrentDevicePushToken', () => {
  it('calls DELETE /api/push-tokens/{stored_id} when id is stored', async () => {
    mockPreferencesGet.mockResolvedValue({ value: '42' });
    mockGetRequiredIdToken.mockResolvedValue('firebase-bearer-token');
    mockLaravelFetch.mockResolvedValue({ ok: true, status: 204, json: vi.fn(), text: vi.fn() });

    await deactivateCurrentDevicePushToken();

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens/42');
  });

  it('skips DELETE when no push_token id is stored', async () => {
    mockPreferencesGet.mockResolvedValue({ value: null });

    await deactivateCurrentDevicePushToken();

    expect(mockLaravelFetch).not.toHaveBeenCalled();
  });

  it('clears both Preferences keys after deactivation', async () => {
    mockPreferencesGet.mockResolvedValue({ value: '42' });
    mockLaravelFetch.mockResolvedValue({ ok: true, status: 204, json: vi.fn(), text: vi.fn() });

    await deactivateCurrentDevicePushToken();

    const removedKeys = mockPreferencesRemove.mock.calls.map(
      (args) => (args[0] as { key: string }).key,
    );
    expect(removedKeys).toContain(PUSH_TOKEN_ID_PREFS_KEY);
    expect(removedKeys).toContain(PUSH_TOKEN_PREVIEW_PREFS_KEY);
  });

  it('clears Preferences even when DELETE call fails', async () => {
    mockPreferencesGet.mockResolvedValue({ value: '42' });
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(500, 'Server error'));

    await deactivateCurrentDevicePushToken();

    const removedKeys = mockPreferencesRemove.mock.calls.map(
      (args) => (args[0] as { key: string }).key,
    );
    expect(removedKeys).toContain(PUSH_TOKEN_ID_PREFS_KEY);
    expect(removedKeys).toContain(PUSH_TOKEN_PREVIEW_PREFS_KEY);
  });

  it('does not throw when DELETE call fails (non-fatal for logout)', async () => {
    mockPreferencesGet.mockResolvedValue({ value: '42' });
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(403, 'Forbidden'));

    await expect(deactivateCurrentDevicePushToken()).resolves.toBeUndefined();
  });

  it('does not throw when laravelFetch rejects (non-fatal for logout)', async () => {
    mockPreferencesGet.mockResolvedValue({ value: '42' });
    mockLaravelFetch.mockRejectedValue(new Error('Network gone'));

    await expect(deactivateCurrentDevicePushToken()).resolves.toBeUndefined();
  });

  it('does not throw when Preferences is unavailable', async () => {
    mockPreferencesGet.mockRejectedValue(new Error('Storage unavailable'));

    await expect(deactivateCurrentDevicePushToken()).resolves.toBeUndefined();
  });
});

// ── initPushTokenRefreshListener ──────────────────────────────────────────────

describe('initPushTokenRefreshListener', () => {
  it('is a no-op on web / non-native platforms', () => {
    setNative(false);

    initPushTokenRefreshListener();

    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it('registers addListener("tokenReceived") on native platform', () => {
    setNative(true);

    initPushTokenRefreshListener();

    expect(mockAddListener).toHaveBeenCalledOnce();
    expect(mockAddListener).toHaveBeenCalledWith('tokenReceived', expect.any(Function));
  });

  it('does not register listener twice (singleton guard)', () => {
    setNative(true);

    initPushTokenRefreshListener();
    initPushTokenRefreshListener();

    expect(mockAddListener).toHaveBeenCalledOnce();
  });

  it('re-registers after _resetListenerForTest', () => {
    setNative(true);

    initPushTokenRefreshListener();
    _resetListenerForTest();
    initPushTokenRefreshListener();

    expect(mockAddListener).toHaveBeenCalledTimes(2);
  });

  it('calls POST /api/push-tokens/refresh when tokenReceived fires', async () => {
    setNative(true);
    mockLaravelFetch.mockResolvedValue(makeOkResponse(FAKE_PUSH_TOKEN_RESPONSE));

    let capturedHandler: ((event: { token: string }) => void) | undefined;
    mockAddListener.mockImplementation(
      (_event: string, handler: (event: { token: string }) => void) => {
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    initPushTokenRefreshListener();
    expect(capturedHandler).toBeDefined();

    capturedHandler!({ token: FAKE_TOKEN });

    // Allow the void async IIFE to fully drain (getRequiredIdToken → laravelFetch →
    // res.json → Preferences.set) before asserting. setTimeout(0) ensures all
    // pending microtasks from the current tick are exhausted before we check.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mockLaravelFetch).toHaveBeenCalledOnce();
    const [url] = mockLaravelFetch.mock.calls[0];
    expect(url).toContain('/api/push-tokens/refresh');
  });

  it('updates stored push_token id after successful token refresh', async () => {
    setNative(true);
    mockLaravelFetch.mockResolvedValue(makeOkResponse({ ...FAKE_PUSH_TOKEN_RESPONSE, id: 99 }));

    let capturedHandler: ((event: { token: string }) => void) | undefined;
    mockAddListener.mockImplementation(
      (_event: string, handler: (event: { token: string }) => void) => {
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    initPushTokenRefreshListener();
    capturedHandler!({ token: FAKE_TOKEN });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: PUSH_TOKEN_ID_PREFS_KEY,
      value: '99',
    });
  });

  it('does not log full token in refresh handler failure warning', async () => {
    setNative(true);
    mockLaravelFetch.mockResolvedValue(makeErrorResponse(500, 'Error'));

    let capturedHandler: ((event: { token: string }) => void) | undefined;
    mockAddListener.mockImplementation(
      (_event: string, handler: (event: { token: string }) => void) => {
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    initPushTokenRefreshListener();
    capturedHandler!({ token: FAKE_TOKEN });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const allWarnOutput = warnSpy.mock.calls.flat().join(' ');
    expect(allWarnOutput).not.toContain(FAKE_TOKEN);
  });
});

// ── pushTokenService object shape ─────────────────────────────────────────────

describe('pushTokenService object', () => {
  it('exports all expected functions', () => {
    expect(typeof pushTokenService.registerPushToken).toBe('function');
    expect(typeof pushTokenService.refreshPushToken).toBe('function');
    expect(typeof pushTokenService.deactivatePushToken).toBe('function');
    expect(typeof pushTokenService.registerCurrentDevicePushToken).toBe('function');
    expect(typeof pushTokenService.deactivateCurrentDevicePushToken).toBe('function');
    expect(typeof pushTokenService.initPushTokenRefreshListener).toBe('function');
  });
});
