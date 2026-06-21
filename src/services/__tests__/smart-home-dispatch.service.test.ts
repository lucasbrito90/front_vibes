import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRequiredIdToken, mockIsDeviceOffline } = vi.hoisted(() => ({
  mockGetRequiredIdToken: vi.fn(async (): Promise<string> => 'mock-firebase-token'),
  mockIsDeviceOffline: vi.fn((): boolean => false),
}));

vi.mock('@/services/auth.service', () => ({
  getRequiredIdToken: mockGetRequiredIdToken,
}));

vi.mock('@/services/provider-connection.service', () => ({
  isDeviceOffline: mockIsDeviceOffline,
  DeviceOfflineError: class DeviceOfflineError extends Error {},
}));

vi.mock('@/services/laravel-http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/laravel-http')>();
  return {
    ...actual,
    laravelFetch: vi.fn((input: string | URL, init?: RequestInit) => fetch(input, init)),
    laravelApiUrl: actual.laravelApiUrl,
  };
});

import { dispatchVibeSmartHomeActions } from '@/services/smart-home-dispatch.service';

const DISPATCH_RESPONSE = {
  data: {
    vibe_id: 42,
    dispatched: 2,
    skipped: 0,
    action_ids: [10, 11],
  },
};

function mockFetch(ok: boolean, body: unknown = DISPATCH_RESPONSE): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (): Promise<Response> =>
        ({
          ok,
          status: ok ? 200 : 500,
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

describe('smart-home-dispatch.service', () => {
  beforeEach(() => {
    mockIsDeviceOffline.mockReturnValue(false);
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    mockFetch(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends a POST to the correct dispatch endpoint', async () => {
    await dispatchVibeSmartHomeActions(42);

    const call = vi.mocked(fetch).mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;

    expect(url).toContain('/api/vibes/42/smart-home/dispatch');
    expect(init.method).toBe('POST');
  });

  it('includes the Firebase Bearer token', async () => {
    await dispatchVibeSmartHomeActions(42);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers['Authorization']).toBe('Bearer mock-firebase-token');
  });

  it('returns the dispatch summary on success', async () => {
    const result = await dispatchVibeSmartHomeActions(42);

    expect(result).toEqual(DISPATCH_RESPONSE.data);
  });

  it('returns null when offline (silently skips)', async () => {
    mockIsDeviceOffline.mockReturnValue(true);

    const result = await dispatchVibeSmartHomeActions(42);

    expect(result).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns null on non-ok HTTP response without throwing', async () => {
    mockFetch(false);

    const result = await dispatchVibeSmartHomeActions(42);

    expect(result).toBeNull();
  });

  it('returns null on network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network error'); }));

    const result = await dispatchVibeSmartHomeActions(42);

    expect(result).toBeNull();
  });

  it('does not throw even if getRequiredIdToken rejects', async () => {
    mockGetRequiredIdToken.mockRejectedValue(new Error('token error'));

    const result = await dispatchVibeSmartHomeActions(42);

    expect(result).toBeNull();
  });
});
