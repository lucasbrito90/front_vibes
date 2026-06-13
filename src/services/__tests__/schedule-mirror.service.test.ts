import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryScheduleMirrorDbAdapter } from '@/services/schedule-mirror/in-memory-schedule-mirror-db.adapter';
import {
  MIRROR_META_OWNER_KEY,
  MIRROR_META_SYNCED_AT_KEY,
} from '@/services/schedule-mirror/schedule-mirror-db.adapter';
import {
  deserializeRecurrenceConfig,
  mirrorRowToSchedule,
  resetScheduleMirrorDbAdapter,
  scheduleMirrorService,
  scheduleToMirrorRow,
  serializeRecurrenceConfig,
  setScheduleMirrorDbAdapter,
} from '@/services/schedule-mirror.service';
import type { Schedule } from '@/services/schedule.service';

const { mockGetSchedules, mockWaitForFirebaseUser } = vi.hoisted(() => ({
  mockGetSchedules: vi.fn(),
  mockWaitForFirebaseUser: vi.fn(async () => ({ uid: 'firebase-user-1' })),
}));

vi.mock('@/services/schedule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/schedule.service')>();
  return {
    ...actual,
    scheduleService: {
      ...actual.scheduleService,
      getSchedules: mockGetSchedules,
    },
  };
});

vi.mock('@/services/auth.service', () => ({
  waitForFirebaseUser: mockWaitForFirebaseUser,
}));

function sampleSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    vibe_id: 10,
    name: 'Morning focus',
    timezone: 'America/Sao_Paulo',
    start_time: '2026-06-13T08:30:00.000Z',
    recurrence_type: 'weekly',
    recurrence_config: { days_of_week: [1, 3, 5] },
    is_enabled: true,
    next_run_at: '2026-06-14T08:30:00.000Z',
    last_run_at: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('schedule-mirror.service', () => {
  let adapter: InMemoryScheduleMirrorDbAdapter;

  beforeEach(() => {
    adapter = new InMemoryScheduleMirrorDbAdapter();
    setScheduleMirrorDbAdapter(adapter);
    mockGetSchedules.mockReset();
    mockWaitForFirebaseUser.mockResolvedValue({ uid: 'firebase-user-1' });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  });

  afterEach(() => {
    resetScheduleMirrorDbAdapter();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  });

  it('serializes and deserializes recurrence_config', () => {
    const config = { days_of_week: [1, 7] };
    const serialized = serializeRecurrenceConfig(config);
    expect(serialized).toBe(JSON.stringify(config));
    expect(deserializeRecurrenceConfig(serialized)).toEqual(config);
    expect(deserializeRecurrenceConfig(null)).toBeNull();
  });

  it('upserts a schedule into the mirror', async () => {
    const schedule = sampleSchedule();
    await scheduleMirrorService.upsertFromApi(schedule);

    const rows = await adapter.listSchedules();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
    expect(mirrorRowToSchedule(rows[0])).toEqual(schedule);
    expect(await adapter.getMeta(MIRROR_META_SYNCED_AT_KEY)).toBeTruthy();
  });

  it('lists cached schedules from the mirror', async () => {
    await scheduleMirrorService.replaceFromApi([
      sampleSchedule({ id: 1 }),
      sampleSchedule({ id: 2, name: 'Evening wind-down' }),
    ]);

    const listed = await scheduleMirrorService.listFromMirror();
    expect(listed).toHaveLength(2);
    expect(listed.map((s) => s.id).sort()).toEqual([1, 2]);
  });

  it('gets a schedule by id from the mirror', async () => {
    await scheduleMirrorService.upsertFromApi(sampleSchedule({ id: 42, name: 'Focus block' }));

    const found = await scheduleMirrorService.getFromMirror(42);
    expect(found?.name).toBe('Focus block');
    expect(await scheduleMirrorService.getFromMirror(999)).toBeNull();
  });

  it('deletes a schedule from the mirror', async () => {
    await scheduleMirrorService.replaceFromApi([
      sampleSchedule({ id: 1 }),
      sampleSchedule({ id: 2 }),
    ]);

    await scheduleMirrorService.deleteFromMirror(1);
    const listed = await scheduleMirrorService.listFromMirror();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(2);
  });

  it('replaces the mirror on successful pullSchedules sync', async () => {
    const apiSchedules = [
      sampleSchedule({ id: 5, name: 'Synced schedule' }),
    ];
    mockGetSchedules.mockResolvedValue(apiSchedules);

    const result = await scheduleMirrorService.pullSchedules();
    expect(result).toEqual(apiSchedules);

    const cached = await scheduleMirrorService.listFromMirror();
    expect(cached).toHaveLength(1);
    expect(cached[0].name).toBe('Synced schedule');
    expect(await scheduleMirrorService.getLastSyncedAt()).toBeTruthy();
  });

  it('preserves prior mirror data when pullSchedules API call fails', async () => {
    await scheduleMirrorService.replaceFromApi([sampleSchedule({ id: 1, name: 'Cached' })]);
    const before = await scheduleMirrorService.listFromMirror();

    mockGetSchedules.mockRejectedValue(new Error('Network down'));
    await expect(scheduleMirrorService.pullSchedules()).rejects.toThrow('Network down');

    const after = await scheduleMirrorService.listFromMirror();
    expect(after).toEqual(before);
  });

  it('clears mirror and owner metadata on clearMirror', async () => {
    await scheduleMirrorService.replaceFromApi([sampleSchedule()]);
    await scheduleMirrorService.clearMirror();

    expect(await adapter.listSchedules()).toEqual([]);
    expect(await adapter.getMeta(MIRROR_META_OWNER_KEY)).toBeNull();
    expect(await adapter.getMeta(MIRROR_META_SYNCED_AT_KEY)).toBeNull();
  });

  it('clears mirror when authenticated owner uid changes', async () => {
    await scheduleMirrorService.replaceFromApi([sampleSchedule({ id: 1 })]);
    mockWaitForFirebaseUser.mockResolvedValue({ uid: 'firebase-user-2' });

    await scheduleMirrorService.listFromMirror();
    expect(await scheduleMirrorService.listFromMirror()).toEqual([]);
    expect(await adapter.getMeta(MIRROR_META_OWNER_KEY)).toBe('firebase-user-2');
  });

  it('scheduleToMirrorRow stores raw_json for hydration', () => {
    const schedule = sampleSchedule();
    const row = scheduleToMirrorRow(schedule, '2026-06-13T12:00:00.000Z');
    expect(JSON.parse(row.raw_json)).toEqual(schedule);
    expect(row.recurrence_config).toBe(JSON.stringify(schedule.recurrence_config));
  });
});
