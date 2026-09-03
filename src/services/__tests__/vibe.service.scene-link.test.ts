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

import { vibeService } from '@/services/vibe.service';

describe('vibe.service — scene_id payload', () => {
  beforeEach(() => {
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            json: async () => ({ data: { id: 1, name: 'Test', scene_id: 5 } }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('includes scene_id when creating a vibe linked to a scene', async () => {
    let capturedBody: string | undefined;

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      capturedBody = init?.body as string;
      return {
        ok: true,
        json: async () => ({ data: { id: 1, name: 'Evening', scene_id: 5 } }),
      } as unknown as Response;
    });

    await vibeService.createVibe({
      name: 'Evening',
      scene_id: 5,
    });

    expect(JSON.parse(capturedBody!)).toMatchObject({
      name: 'Evening',
      scene_id: 5,
    });
  });

  it('sends scene_id null when unlinking a vibe from its scene', async () => {
    let capturedBody: string | undefined;

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      capturedBody = init?.body as string;
      return {
        ok: true,
        json: async () => ({ data: { id: 7, name: 'Morning', scene_id: null } }),
      } as unknown as Response;
    });

    await vibeService.updateVibe(7, {
      scene_id: null,
    });

    expect(JSON.parse(capturedBody!)).toMatchObject({
      scene_id: null,
    });
  });

  it('omits scene_id from create payload when not provided', async () => {
    let capturedBody: string | undefined;

    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      capturedBody = init?.body as string;
      return {
        ok: true,
        json: async () => ({ data: { id: 2, name: 'Plain' } }),
      } as unknown as Response;
    });

    await vibeService.createVibe({ name: 'Plain' });

    const parsed = JSON.parse(capturedBody!) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('scene_id');
  });
});
