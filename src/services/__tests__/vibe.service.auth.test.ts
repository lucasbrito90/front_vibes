import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRequiredIdToken } = vi.hoisted(() => ({
  mockGetRequiredIdToken: vi.fn(async (): Promise<string> => 'mock-firebase-token'),
}));

vi.mock('@/services/auth.service', () => ({
  getRequiredIdToken: mockGetRequiredIdToken,
}));

import { vibeService } from '@/services/vibe.service';

describe('vibe.service — protected requests', () => {
  beforeEach(() => {
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            json: async () => ({ data: [] }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('obtains Firebase token before calling GET /api/vibes', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'BearerTokenValue';
    });

    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer BearerTokenValue');
      return {
        ok: true,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await vibeService.getVibes();
    expect(seq).toEqual(['token', 'fetch']);
  });

  it('does not call fetch when token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));

    await expect(vibeService.getVibes()).rejects.toThrow('Firebase auth gate');
    expect(fetch).not.toHaveBeenCalled();
  });
});
