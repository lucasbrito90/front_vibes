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

import { scheduleExecutionService } from '@/services/schedule-execution.service';

const MOCK_EXECUTION = {
  id: 42,
  schedule_id: 7,
  occurrence_key: '7:1749820000',
  scheduled_for: '2026-06-13T10:00:00.000Z',
  executed_at: '2026-06-13T10:00:01.000Z',
  status: 'dispatched',
  log: null,
  created_at: '2026-06-13T10:00:01.000Z',
};

describe('schedule-execution.service — listScheduleExecutions', () => {
  beforeEach(() => {
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ data: [MOCK_EXECUTION] }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('calls GET /api/schedules/:id/executions with correct URL', async () => {
    let capturedUrl: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [MOCK_EXECUTION] }),
      } as unknown as Response;
    });

    await scheduleExecutionService.listScheduleExecutions(7);
    expect(capturedUrl).toMatch(/\/api\/schedules\/7\/executions$/);
  });

  it('includes a Firebase Bearer token in the Authorization header', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'ExecBearerToken';
    });

    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer ExecBearerToken');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    await scheduleExecutionService.listScheduleExecutions(7);
    expect(seq).toEqual(['token', 'fetch']);
  });

  it('returns the data array from the response', async () => {
    const result = await scheduleExecutionService.listScheduleExecutions(7);
    expect(result).toHaveLength(1);
    expect(result[0].occurrence_key).toBe('7:1749820000');
    expect(result[0].status).toBe('dispatched');
  });

  it('throws when the Firebase token cannot be resolved', async () => {
    mockGetRequiredIdToken.mockRejectedValueOnce(new Error('Firebase auth gate'));
    await expect(scheduleExecutionService.listScheduleExecutions(7)).rejects.toThrow(
      'Firebase auth gate',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('schedule-execution.service — acknowledgeScheduleExecution', () => {
  beforeEach(() => {
    mockGetRequiredIdToken.mockResolvedValue('mock-firebase-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (): Promise<Response> =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ data: { ...MOCK_EXECUTION, status: 'acknowledged' } }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POSTs to /api/schedules/:id/executions/:key/ack with URL-encoded occurrence_key', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = init?.method;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...MOCK_EXECUTION, status: 'acknowledged' } }),
      } as unknown as Response;
    });

    await scheduleExecutionService.acknowledgeScheduleExecution(7, '7:1749820000');

    expect(capturedMethod).toBe('POST');
    // The colon in the occurrence_key must be URL-encoded as %3A
    expect(capturedUrl).toMatch(/\/api\/schedules\/7\/executions\/7%3A1749820000\/ack$/);
  });

  it('includes a Firebase Bearer token in the Authorization header', async () => {
    const seq: string[] = [];
    mockGetRequiredIdToken.mockImplementation(async () => {
      seq.push('token');
      return 'AckBearerToken';
    });

    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seq.push('fetch');
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer AckBearerToken');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...MOCK_EXECUTION, status: 'acknowledged' } }),
      } as unknown as Response;
    });

    await scheduleExecutionService.acknowledgeScheduleExecution(7, '7:1749820000');
    expect(seq).toEqual(['token', 'fetch']);
  });

  it('returns the updated execution with status acknowledged', async () => {
    const result = await scheduleExecutionService.acknowledgeScheduleExecution(7, '7:1749820000');
    expect(result.status).toBe('acknowledged');
    expect(result.occurrence_key).toBe('7:1749820000');
  });

  it('throws on non-ok response (e.g. 404 for unknown key)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Execution not found.' }),
    } as unknown as Response);

    await expect(
      scheduleExecutionService.acknowledgeScheduleExecution(7, '7:9999999999'),
    ).rejects.toThrow('Execution not found.');
  });
});
