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

import { deviceService, type DevicePayload } from '@/services/device.service';
import { DeviceOfflineError } from '@/services/provider-connection.service';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

const payload: DevicePayload = {
  provider_connection_id: 1,
  name: 'Living room lamp',
  type: 'light',
  provider_device_id: 'light.living_room',
};

describe('device.service — protected requests', () => {
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

  it('sends a Firebase Bearer token before calling GET /api/devices', async () => {
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

    await deviceService.getDevices();
    expect(seq).toEqual(['token', 'fetch']);
    expect(capturedUrl).toMatch(/\/api\/devices$/);
  });

  it('PATCHes the device update endpoint URL', async () => {
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
        json: async () => ({ data: { id: 3, name: 'Renamed' } }),
      } as unknown as Response;
    });

    await deviceService.updateDevice(3, { name: 'Renamed', type: 'switch' });
    expect(capturedMethod).toBe('PATCH');
    expect(capturedUrl).toMatch(/\/api\/devices\/3$/);
    expect(JSON.parse(capturedBody ?? '{}')).toMatchObject({ name: 'Renamed', type: 'switch' });
  });

  it('DELETEs the device endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
    });

    await deviceService.deleteDevice(8);
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toMatch(/\/api\/devices\/8$/);
  });

  it('blocks createDevice when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(deviceService.createDevice(payload)).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks updateDevice when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(deviceService.updateDevice(1, { name: 'x' })).rejects.toBeInstanceOf(
      DeviceOfflineError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks deleteDevice when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(deviceService.deleteDevice(1)).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(deviceService.getDevices()).rejects.toThrow('Firebase auth gate');
    expect(fetch).not.toHaveBeenCalled();
  });
});
