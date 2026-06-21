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
  DeviceOfflineError,
  providerConnectionService,
  type ProviderConnectionPayload,
} from '@/services/provider-connection.service';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

const payload: ProviderConnectionPayload = {
  name: 'Home HA',
  provider: 'home_assistant',
  config: { base_url: 'https://ha.example.com:8123' },
  encrypted_credentials: { access_token: 'super-secret-token' },
};

describe('provider-connection.service — protected requests', () => {
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

  it('sends a Firebase Bearer token before calling GET /api/provider-connections', async () => {
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

    await providerConnectionService.getProviderConnections();
    expect(seq).toEqual(['token', 'fetch']);
    expect(capturedUrl).toMatch(/\/api\/provider-connections$/);
  });

  it('POSTs the create payload with nested encrypted_credentials.access_token', async () => {
    let capturedBody: string | undefined;
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      capturedMethod = init?.method;
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 5, name: 'Home HA', provider: 'home_assistant' } }),
      } as unknown as Response;
    });

    const created = await providerConnectionService.createProviderConnection(payload);
    expect(created.id).toBe(5);
    expect(capturedMethod).toBe('POST');

    const parsed = JSON.parse(capturedBody ?? '{}');
    expect(parsed).toMatchObject({
      name: 'Home HA',
      provider: 'home_assistant',
      config: { base_url: 'https://ha.example.com:8123' },
      encrypted_credentials: { access_token: 'super-secret-token' },
    });
  });

  it('does not log or retain the access token after submit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 5 } }),
    } as unknown as Response);

    await providerConnectionService.createProviderConnection(payload);

    const allLogArgs = [...warnSpy.mock.calls, ...logSpy.mock.calls].flat().map(String).join(' ');
    expect(allLogArgs).not.toContain('super-secret-token');

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('POSTs to the sync endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            provider_connection_id: 7,
            synced: 3,
            created: 1,
            updated: 2,
            offline: 0,
            status: 'connected',
          },
        }),
      } as unknown as Response;
    });

    const result = await providerConnectionService.syncProviderConnection(7);
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toMatch(/\/api\/provider-connections\/7\/sync$/);
    expect(result.synced).toBe(3);
  });

  it('PATCHes the update endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 9 } }),
      } as unknown as Response;
    });

    await providerConnectionService.updateProviderConnection(9, { name: 'Renamed' });
    expect(capturedMethod).toBe('PATCH');
    expect(capturedUrl).toMatch(/\/api\/provider-connections\/9$/);
  });

  it('DELETEs the connection endpoint URL', async () => {
    let capturedUrl = '';
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
    });

    await providerConnectionService.deleteProviderConnection(4);
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toMatch(/\/api\/provider-connections\/4$/);
  });

  it('blocks createProviderConnection when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(
      providerConnectionService.createProviderConnection(payload),
    ).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks updateProviderConnection when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(
      providerConnectionService.updateProviderConnection(1, { name: 'x' }),
    ).rejects.toBeInstanceOf(DeviceOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks deleteProviderConnection when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(providerConnectionService.deleteProviderConnection(1)).rejects.toBeInstanceOf(
      DeviceOfflineError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks syncProviderConnection when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(providerConnectionService.syncProviderConnection(1)).rejects.toBeInstanceOf(
      DeviceOfflineError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(providerConnectionService.getProviderConnections()).rejects.toThrow(
      'Firebase auth gate',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
