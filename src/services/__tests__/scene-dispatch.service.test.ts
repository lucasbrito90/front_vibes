import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRequiredIdToken } = vi.hoisted(() => ({
  mockGetRequiredIdToken: vi.fn(async (): Promise<string> => 'mock-firebase-token'),
}));

vi.mock('@/services/auth.service', () => ({
  getRequiredIdToken: mockGetRequiredIdToken,
}));

vi.mock('@/services/laravel-http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/laravel-http')>();
  return {
    ...actual,
    laravelFetch: vi.fn((input: string | URL, init?: RequestInit) => fetch(input, init)),
    laravelApiUrl: actual.laravelApiUrl,
  };
});

import { sceneDispatchService } from '@/services/scene-dispatch.service';
import { DeviceOfflineError } from '@/services/provider-connection.service';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

const mockResult = {
  scene_id: 7,
  dispatched: 2,
  skipped: 1,
  action_ids: [10, 11],
};

describe('scene-dispatch.service — protected requests', () => {
  beforeEach(() => {
    setOnline(true);
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ data: mockResult }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setOnline(true);
  });

  it('sends a Firebase Bearer token before calling POST /api/scenes/:id/execute', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'BearerTokenValue';
    });

    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      capturedUrl = String(input);
      capturedMethod = init?.method;
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer BearerTokenValue');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: mockResult }),
      } as unknown as Response;
    });

    const result = await sceneDispatchService.executeScene(7);
    expect(seq).toEqual(['token', 'fetch']);
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toMatch(/\/api\/scenes\/7\/execute$/);
    expect(result).toEqual(mockResult);
  });

  it('blocks executeScene when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(sceneDispatchService.executeScene(7)).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(sceneDispatchService.executeScene(7)).rejects.toThrow('Firebase auth gate');
    expect(fetch).not.toHaveBeenCalled();
  });
});
