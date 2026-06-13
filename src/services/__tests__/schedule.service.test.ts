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
  ScheduleOfflineError,
  scheduleService,
  type SchedulePayload,
} from '@/services/schedule.service';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

const payload: SchedulePayload = {
  vibe_id: 1,
  name: 'Morning focus',
  timezone: 'UTC',
  start_time: '2026-06-13T08:30:00.000Z',
  recurrence_type: 'daily',
  recurrence_config: null,
  is_enabled: true,
};

describe('schedule.service — protected requests', () => {
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

  it('sends a Firebase Bearer token before calling GET /api/schedules', async () => {
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
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await scheduleService.getSchedules();
    expect(seq).toEqual(['token', 'fetch']);
  });

  it('POSTs the payload as JSON on create', async () => {
    let capturedBody: string | undefined;
    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 9, ...payload } }),
      } as unknown as Response;
    });

    const created = await scheduleService.createSchedule(payload);
    expect(created.id).toBe(9);
    expect(JSON.parse(capturedBody ?? '{}')).toMatchObject({ name: 'Morning focus', recurrence_type: 'daily' });
  });

  it('blocks createSchedule when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(scheduleService.createSchedule(payload)).rejects.toBeInstanceOf(ScheduleOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks updateSchedule when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(scheduleService.updateSchedule(1, payload)).rejects.toBeInstanceOf(ScheduleOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks deleteSchedule when offline and never calls fetch', async () => {
    setOnline(false);
    await expect(scheduleService.deleteSchedule(1)).rejects.toBeInstanceOf(ScheduleOfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(scheduleService.getSchedules()).rejects.toThrow('Firebase auth gate');
    expect(fetch).not.toHaveBeenCalled();
  });
});
