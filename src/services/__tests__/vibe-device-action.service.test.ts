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

import {
  vibeDeviceActionService,
  type VibeDeviceActionPayload,
} from '@/services/vibe-device-action.service';
import { DeviceOfflineError } from '@/services/provider-connection.service';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

const createPayload: VibeDeviceActionPayload = {
  device_id: 12,
  action_type: 'turn_on',
  delay_seconds: 30,
};

describe('vibe-device-action.service — protected requests', () => {
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
            json: async () => ({ data: [] }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setOnline(true);
  });

  it('sends a Firebase Bearer token before calling GET /api/vibes/:id/device-actions', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'BearerTokenValue';
    });

    let capturedUrl = '';
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      capturedUrl = String(input);
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer BearerTokenValue');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await vibeDeviceActionService.listVibeDeviceActions(7);
    expect(seq).toEqual(['token', 'fetch']);
    expect(capturedUrl).toMatch(/\/api\/vibes\/7\/device-actions$/);
  });

  it('POSTs the create payload to the collection URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    let capturedBody: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 1, ...createPayload } }),
      } as unknown as Response;
    });

    await vibeDeviceActionService.createVibeDeviceAction(7, createPayload);
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toMatch(/\/api\/vibes\/7\/device-actions$/);
    expect(JSON.parse(capturedBody ?? '{}')).toMatchObject({
      device_id: 12,
      action_type: 'turn_on',
      delay_seconds: 30,
    });
  });

  it('PATCHes the action update URL with the partial payload', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    let capturedBody: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 3, action_type: 'toggle' } }),
      } as unknown as Response;
    });

    await vibeDeviceActionService.updateVibeDeviceAction(7, 3, { action_type: 'toggle' });
    expect(capturedMethod).toBe('PATCH');
    expect(capturedUrl).toMatch(/\/api\/vibes\/7\/device-actions\/3$/);
    expect(JSON.parse(capturedBody ?? '{}')).toMatchObject({ action_type: 'toggle' });
  });

  it('DELETEs the action endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
    });

    await vibeDeviceActionService.deleteVibeDeviceAction(7, 9);
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toMatch(/\/api\/vibes\/7\/device-actions\/9$/);
  });

  it('POSTs ordered_ids to the reorder endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    let capturedBody: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await vibeDeviceActionService.reorderVibeDeviceActions(7, [3, 1, 2]);
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toMatch(/\/api\/vibes\/7\/device-actions\/reorder$/);
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ ordered_ids: [3, 1, 2] });
  });

  it('blocks createVibeDeviceAction when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(
      vibeDeviceActionService.createVibeDeviceAction(7, createPayload),
    ).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks updateVibeDeviceAction when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(
      vibeDeviceActionService.updateVibeDeviceAction(7, 1, { delay_seconds: 5 }),
    ).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks deleteVibeDeviceAction when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(vibeDeviceActionService.deleteVibeDeviceAction(7, 1)).rejects.toBeInstanceOf(
      DeviceOfflineError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks reorderVibeDeviceActions when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(vibeDeviceActionService.reorderVibeDeviceActions(7, [1, 2])).rejects.toBeInstanceOf(
      DeviceOfflineError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(vibeDeviceActionService.listVibeDeviceActions(7)).rejects.toThrow(
      'Firebase auth gate',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
