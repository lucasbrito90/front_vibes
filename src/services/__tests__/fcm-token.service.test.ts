import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  devVerifyFcmToken,
  fcmTokenPreview,
  fcmTokenService,
  getFcmToken,
  isFcmAvailable,
  requestFcmPermission,
} from '@/services/fcm-token.service';

// ── Plugin mocks ───────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest.
// Use vi.hoisted() so the mock variables are available inside the factories.

const { mockRequestPermissions, mockGetToken, mockIsNativePlatform } = vi.hoisted(() => ({
  mockRequestPermissions: vi.fn(),
  mockGetToken: vi.fn(),
  mockIsNativePlatform: vi.fn<[], boolean>(),
}));

vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    requestPermissions: mockRequestPermissions,
    getToken: mockGetToken,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function setNative(value: boolean): void {
  mockIsNativePlatform.mockReturnValue(value);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setNative(false); // default: web/non-native
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── fcmTokenPreview ───────────────────────────────────────────────────────────

describe('fcmTokenPreview', () => {
  it('returns preview with first 6 + ... + last 4 for long tokens', () => {
    const token = 'abcdef1234567890ghijklmnopqrstuvwxyz';
    const preview = fcmTokenPreview(token);

    expect(preview).toBe('abcdef...wxyz');
    expect(preview).not.toBe(token);
    expect(preview.length).toBeLessThan(token.length);
  });

  it('does not expose the full token in preview', () => {
    const token = 'fcm-test-token-' + 'x'.repeat(120);
    const preview = fcmTokenPreview(token);

    expect(preview).not.toBe(token);
    expect(preview).not.toContain(token);
    expect(preview.length).toBeLessThan(token.length);
  });

  it('masks short tokens safely', () => {
    expect(fcmTokenPreview('short')).toBe('**masked**');
    expect(fcmTokenPreview('')).toBe('**masked**');
    expect(fcmTokenPreview('1234567890')).toBe('**masked**'); // exactly 10 chars → masked
  });

  it('preview contains separator dots but not full token content', () => {
    const token = 'AAAAAA_middle_BBBB';
    const preview = fcmTokenPreview(token);

    expect(preview).toContain('...');
    expect(preview).not.toContain('_middle_');
  });
});

// ── isFcmAvailable ────────────────────────────────────────────────────────────

describe('isFcmAvailable', () => {
  it('returns false on web / non-native platform', () => {
    setNative(false);
    expect(isFcmAvailable()).toBe(false);
  });

  it('returns true on native platform', () => {
    setNative(true);
    expect(isFcmAvailable()).toBe(true);
  });
});

// ── requestFcmPermission ──────────────────────────────────────────────────────

describe('requestFcmPermission', () => {
  it('returns false without calling plugin when not native (web no-op)', async () => {
    setNative(false);
    const result = await requestFcmPermission();

    expect(result).toBe(false);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('returns true when plugin grants permission', async () => {
    setNative(true);
    mockRequestPermissions.mockResolvedValue({ receive: 'granted' });

    const result = await requestFcmPermission();

    expect(result).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledOnce();
  });

  it('returns false when plugin denies permission', async () => {
    setNative(true);
    mockRequestPermissions.mockResolvedValue({ receive: 'denied' });

    const result = await requestFcmPermission();

    expect(result).toBe(false);
  });

  it('returns false when plugin returns prompt (not yet determined)', async () => {
    setNative(true);
    mockRequestPermissions.mockResolvedValue({ receive: 'prompt' });

    const result = await requestFcmPermission();

    expect(result).toBe(false);
  });

  it('returns false and does not throw when plugin throws', async () => {
    setNative(true);
    mockRequestPermissions.mockRejectedValue(new Error('Plugin error'));

    await expect(requestFcmPermission()).resolves.toBe(false);
  });
});

// ── getFcmToken ───────────────────────────────────────────────────────────────

describe('getFcmToken', () => {
  it('returns null without calling plugin when not native (web no-op)', async () => {
    setNative(false);
    const token = await getFcmToken();

    expect(token).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('calls plugin and returns token string on native', async () => {
    setNative(true);
    const fakeToken = 'fcm-real-token-' + 'z'.repeat(140);
    mockGetToken.mockResolvedValue({ token: fakeToken });

    const token = await getFcmToken();

    expect(token).toBe(fakeToken);
    expect(mockGetToken).toHaveBeenCalledOnce();
  });

  it('returns null when plugin returns undefined token', async () => {
    setNative(true);
    mockGetToken.mockResolvedValue({ token: undefined });

    const token = await getFcmToken();

    expect(token).toBeNull();
  });

  it('returns null and does not throw when plugin throws', async () => {
    setNative(true);
    mockGetToken.mockRejectedValue(new Error('FCM unavailable'));

    await expect(getFcmToken()).resolves.toBeNull();
  });
});

// ── devVerifyFcmToken ─────────────────────────────────────────────────────────

describe('devVerifyFcmToken', () => {
  it('does not log full token — logs only preview', async () => {
    setNative(true);
    const fakeToken = 'fcm-dev-token-ABCDEF-' + 'y'.repeat(120);
    mockRequestPermissions.mockResolvedValue({ receive: 'granted' });
    mockGetToken.mockResolvedValue({ token: fakeToken });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await devVerifyFcmToken();

    const allLogArgs = spy.mock.calls.flat().join(' ');
    expect(allLogArgs).not.toContain(fakeToken);
    expect(allLogArgs).toContain('...');
  });

  it('logs info when not on native platform (web no-op message)', async () => {
    setNative(false);
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await devVerifyFcmToken();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[FCM]');
  });

  it('warns when permission is denied', async () => {
    setNative(true);
    mockRequestPermissions.mockResolvedValue({ receive: 'denied' });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await devVerifyFcmToken();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[FCM]'));
  });

  it('warns when token retrieval returns null', async () => {
    setNative(true);
    mockRequestPermissions.mockResolvedValue({ receive: 'granted' });
    mockGetToken.mockResolvedValue({ token: undefined });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await devVerifyFcmToken();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[FCM]'));
  });
});

// ── Service object shape ──────────────────────────────────────────────────────

describe('fcmTokenService object', () => {
  it('exports all expected functions', () => {
    expect(typeof fcmTokenService.isFcmAvailable).toBe('function');
    expect(typeof fcmTokenService.requestFcmPermission).toBe('function');
    expect(typeof fcmTokenService.getFcmToken).toBe('function');
    expect(typeof fcmTokenService.fcmTokenPreview).toBe('function');
    expect(typeof fcmTokenService.devVerifyFcmToken).toBe('function');
  });
});
