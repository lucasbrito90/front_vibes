import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSchedules,
  mockCreateSchedule,
  mockListFromMirror,
  mockReplaceFromApi,
  mockUpsertFromApi,
  mockDeleteFromMirror,
  mockGetLastSyncedAt,
} = vi.hoisted(() => ({
  mockGetSchedules: vi.fn(),
  mockCreateSchedule: vi.fn(),
  mockListFromMirror: vi.fn(),
  mockReplaceFromApi: vi.fn(),
  mockUpsertFromApi: vi.fn(),
  mockDeleteFromMirror: vi.fn(),
  mockGetLastSyncedAt: vi.fn(async () => '2026-06-13T10:00:00.000Z'),
}));

vi.mock('@/services/schedule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/schedule.service')>();
  return {
    ...actual,
    scheduleService: {
      ...actual.scheduleService,
      getSchedules: mockGetSchedules,
      createSchedule: mockCreateSchedule,
      updateSchedule: vi.fn(),
      deleteSchedule: vi.fn(),
    },
    isDeviceOffline: vi.fn(() => false),
  };
});

vi.mock('@/services/schedule-mirror.service', () => ({
  scheduleMirrorService: {
    initialize: vi.fn(async () => undefined),
    listFromMirror: mockListFromMirror,
    getFromMirror: vi.fn(),
    replaceFromApi: mockReplaceFromApi,
    upsertFromApi: mockUpsertFromApi,
    deleteFromMirror: mockDeleteFromMirror,
    getLastSyncedAt: mockGetLastSyncedAt,
    pullSchedules: vi.fn(),
    clearMirror: vi.fn(),
  },
}));

import { isDeviceOffline } from '@/services/schedule.service';
import { useSchedules } from '@/composables/useSchedules';
import type { Schedule } from '@/services/schedule.service';

function sampleSchedule(id = 1): Schedule {
  return {
    id,
    vibe_id: 10,
    name: 'Morning focus',
    timezone: 'UTC',
    start_time: '2026-06-13T08:30:00.000Z',
    recurrence_type: 'daily',
    recurrence_config: null,
    is_enabled: true,
    next_run_at: '2026-06-14T08:30:00.000Z',
    last_run_at: null,
    created_at: null,
    updated_at: null,
  };
}

describe('useSchedules — mirror integration', () => {
  beforeEach(() => {
    const { schedules, fromMirror, lastSyncedAt } = useSchedules();
    schedules.value = [];
    fromMirror.value = false;
    lastSyncedAt.value = null;

    vi.mocked(isDeviceOffline).mockReturnValue(false);
    mockGetSchedules.mockReset();
    mockListFromMirror.mockReset();
    mockReplaceFromApi.mockReset();
    mockCreateSchedule.mockReset();
    mockUpsertFromApi.mockReset();
    mockDeleteFromMirror.mockReset();
    mockGetLastSyncedAt.mockResolvedValue('2026-06-13T10:00:00.000Z');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('online fetch writes to the mirror and renders API data', async () => {
    const apiData = [sampleSchedule(1), sampleSchedule(2)];
    mockGetSchedules.mockResolvedValue(apiData);
    mockReplaceFromApi.mockResolvedValue(undefined);

    const { fetchSchedules, schedules, fromMirror, lastSyncedAt } = useSchedules();
    await fetchSchedules();

    expect(mockGetSchedules).toHaveBeenCalled();
    expect(mockReplaceFromApi).toHaveBeenCalledWith(apiData);
    expect(schedules.value).toEqual(apiData);
    expect(fromMirror.value).toBe(false);
    expect(lastSyncedAt.value).toBe('2026-06-13T10:00:00.000Z');
  });

  it('offline fetch reads from the mirror', async () => {
    vi.mocked(isDeviceOffline).mockReturnValue(true);
    const cached = [sampleSchedule(7)];
    mockListFromMirror.mockResolvedValue(cached);

    const { fetchSchedules, schedules, fromMirror } = useSchedules();
    await fetchSchedules();

    expect(mockGetSchedules).not.toHaveBeenCalled();
    expect(mockListFromMirror).toHaveBeenCalled();
    expect(schedules.value).toEqual(cached);
    expect(fromMirror.value).toBe(true);
  });

  it('blocks offline createSchedule via the service layer', async () => {
    vi.mocked(isDeviceOffline).mockReturnValue(true);
    const { ScheduleOfflineError } = await import('@/services/schedule.service');
    mockCreateSchedule.mockRejectedValue(new ScheduleOfflineError());

    const { createSchedule } = useSchedules();
    const result = await createSchedule({
      vibe_id: 1,
      name: 'Test',
      timezone: 'UTC',
      start_time: '2026-06-13T08:30:00.000Z',
      recurrence_type: 'once',
    });

    expect(result).toBeNull();
    expect(mockCreateSchedule).toHaveBeenCalled();
  });
});
