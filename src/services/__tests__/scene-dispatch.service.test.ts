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
  scene_execution_id: 'exec-uuid-123',
};

const mockExecutionSummary = {
  scene_execution_id: 'exec-uuid-123',
  scene_id: 7,
  state: 'success' as const,
  count_success: 2,
  count_non_success: 0,
  count_total: 2,
  executed_at: '2026-09-05T00:00:00Z',
  by_provider: [{ provider: 'home_assistant', count_success: 2, count_non_success: 0 }],
  actions: [],
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

  it('GETs the execution summary for a given sceneId and executionId', async () => {
    let capturedUrl = '';
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: mockExecutionSummary }),
      } as unknown as Response;
    });

    const result = await sceneDispatchService.getExecutionSummary(7, 'exec-uuid-123');
    expect(capturedUrl).toMatch(/\/api\/scenes\/7\/executions\/exec-uuid-123$/);
    expect(result).toEqual(mockExecutionSummary);
  });

  it('getExecutionSummary returns null for 404 (row not yet written)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not Found' }),
    } as unknown as Response);

    const result = await sceneDispatchService.getExecutionSummary(7, 'exec-uuid-123');
    expect(result).toBeNull();
  });

  it('getExecutionSummary throws on non-404 error responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    } as unknown as Response);

    await expect(sceneDispatchService.getExecutionSummary(7, 'exec-uuid-123')).rejects.toThrow(
      'Server error',
    );
  });
});
