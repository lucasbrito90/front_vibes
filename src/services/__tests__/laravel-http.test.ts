import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIsNativePlatform, mockCapacitorHttpRequest } = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn((): boolean => false),
  mockCapacitorHttpRequest: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
  },
  CapacitorHttp: {
    request: mockCapacitorHttpRequest,
  },
}));

import {
  isHttpApiBase,
  laravelApiUrl,
  laravelFetch,
  resolveLaravelHttpTransport,
  shouldUseCapacitorHttpForApi,
} from '@/services/laravel-http';

describe('laravel-http', () => {
  beforeEach(() => {
    mockIsNativePlatform.mockReturnValue(false);
    mockCapacitorHttpRequest.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ data: [] }),
            text: async () => '[]',
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('detects HTTP API base', () => {
    expect(isHttpApiBase('http://192.168.1.70:8000')).toBe(true);
    expect(isHttpApiBase('https://staging-api.ixora-app.app')).toBe(false);
  });

  it('uses fetch on web even for HTTP API', () => {
    expect(shouldUseCapacitorHttpForApi('http://192.168.1.70:8000')).toBe(false);
    expect(resolveLaravelHttpTransport('http://192.168.1.70:8000')).toBe('fetch');
  });

  it('uses CapacitorHttp on native HTTP API', () => {
    mockIsNativePlatform.mockReturnValue(true);
    expect(shouldUseCapacitorHttpForApi('http://192.168.1.70:8000')).toBe(true);
    expect(resolveLaravelHttpTransport('http://192.168.1.70:8000')).toBe('capacitor-http');
  });

  it('uses fetch on native HTTPS API', () => {
    mockIsNativePlatform.mockReturnValue(true);
    expect(shouldUseCapacitorHttpForApi('https://staging-api.ixora-app.app')).toBe(false);
    expect(resolveLaravelHttpTransport('https://staging-api.ixora-app.app')).toBe('fetch');
  });

  it('builds API URLs from paths', () => {
    expect(laravelApiUrl('/api/auth/sync', 'http://192.168.1.70:8000')).toBe(
      'http://192.168.1.70:8000/api/auth/sync',
    );
  });

  it('delegates to fetch on web', async () => {
    await laravelFetch('http://192.168.1.70:8000/api/vibes', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(mockCapacitorHttpRequest).not.toHaveBeenCalled();
  });

  it('uses CapacitorHttp on native HTTP and forwards Authorization', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockCapacitorHttpRequest.mockResolvedValue({
      status: 200,
      data: { data: { id: 1 } },
      headers: { 'content-type': 'application/json' },
    });

    const res = await laravelFetch('http://192.168.1.70:8000/api/auth/sync', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer firebase-id-token',
        Accept: 'application/json',
      },
    });

    expect(mockCapacitorHttpRequest).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    const request = mockCapacitorHttpRequest.mock.calls[0][0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(request).toMatchObject({
      url: 'http://192.168.1.70:8000/api/auth/sync',
      method: 'POST',
    });
    expect(request.headers.authorization).toBe('Bearer firebase-id-token');
    expect(request.headers.accept).toBe('application/json');
    expect(res.ok).toBe(true);
    await expect(res.json()).resolves.toEqual({ data: { id: 1 } });
  });
});
