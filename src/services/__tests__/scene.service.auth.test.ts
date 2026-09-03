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

import { sceneService } from '@/services/scene.service';

const mockScene = {
  id: 1,
  name: 'Movie Night',
  description: 'Dim lights',
  created_at: '2026-08-30T00:00:00.000000Z',
  updated_at: '2026-08-30T00:00:00.000000Z',
};

function mockOkJson(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as unknown as Response;
}

describe('scene.service — protected requests', () => {
  beforeEach(() => {
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => mockOkJson({ data: [] })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('obtains Firebase token before calling GET /api/scenes', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'BearerTokenValue';
    });

    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer BearerTokenValue');
      return mockOkJson({ data: [] });
    });

    await sceneService.getScenes();
    expect(seq).toEqual(['token', 'fetch']);
  });

  it('does not call fetch when token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));

    await expect(sceneService.getScenes()).rejects.toThrow('Firebase auth gate');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls GET /api/scenes/:id with auth headers', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/scenes/42');
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer mock-firebase-token');
      return mockOkJson({ data: mockScene });
    });

    const scene = await sceneService.getScene(42);
    expect(scene).toEqual(mockScene);
  });

  it('calls POST /api/scenes with auth headers and JSON body', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/scenes');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ name: 'Bedtime', description: null }));
      return mockOkJson({ data: mockScene });
    });

    const scene = await sceneService.createScene({ name: 'Bedtime', description: null });
    expect(scene.name).toBe('Movie Night');
  });

  it('calls PATCH /api/scenes/:id with auth headers', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/scenes/7');
      expect(init?.method).toBe('PATCH');
      return mockOkJson({ data: { ...mockScene, name: 'Updated' } });
    });

    const scene = await sceneService.updateScene(7, { name: 'Updated' });
    expect(scene.name).toBe('Updated');
  });

  it('calls DELETE /api/scenes/:id with auth headers', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/scenes/9');
      expect(init?.method).toBe('DELETE');
      return mockOkJson({});
    });

    await sceneService.deleteScene(9);
    expect(fetch).toHaveBeenCalled();
  });
});
