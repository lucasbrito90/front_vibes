import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NotificationToSchedule,
  ScheduleNotificationAdapter,
  ScheduleNotificationExtra,
} from '@/services/schedule-notification/schedule-notification.adapter';
import {
  NOTIFICATION_PERMISSION_DENIED_MESSAGE,
  SCHEDULE_NOTIFICATION_CHANNEL_ID,
  resetScheduleNotificationAdapter,
  scheduleNotificationService,
  setScheduleNotificationAdapter,
} from '@/services/schedule-notification.service';
import type { Schedule } from '@/services/schedule.service';

// ── Preferences mock ───────────────────────────────────────────────────────────
const prefsStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: prefsStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      prefsStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      prefsStore.delete(key);
    }),
  },
}));

// ── Mock adapter factory ───────────────────────────────────────────────────────

class MockScheduleNotificationAdapter implements ScheduleNotificationAdapter {
  available = true;
  permission: 'granted' | 'denied' | 'prompt' = 'granted';
  scheduled: NotificationToSchedule[] = [];
  cancelled: number[] = [];
  channels: Array<{ id: string; name: string }> = [];
  tapHandler: ((extra: ScheduleNotificationExtra) => void) | null = null;

  isAvailable(): boolean {
    return this.available;
  }

  async checkPermissions() {
    return this.permission;
  }

  async requestPermissions() {
    return this.permission;
  }

  async createChannel(id: string, name: string): Promise<void> {
    this.channels.push({ id, name });
  }

  async schedule(notifications: NotificationToSchedule[]): Promise<void> {
    this.scheduled.push(...notifications);
  }

  async cancel(ids: number[]): Promise<void> {
    this.cancelled.push(...ids);
    this.scheduled = this.scheduled.filter((n) => !ids.includes(n.id));
  }

  async addTapListener(handler: (extra: ScheduleNotificationExtra) => void): Promise<void> {
    this.tapHandler = handler;
  }

  async removeAllListeners(): Promise<void> {
    this.tapHandler = null;
  }
}

function sampleSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    vibe_id: 10,
    name: 'Morning focus',
    timezone: 'America/Sao_Paulo',
    start_time: '2026-06-13T08:30:00.000Z',
    recurrence_type: 'daily',
    recurrence_config: null,
    is_enabled: true,
    next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour in the future
    last_run_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('schedule-notification.service', () => {
  let mock: MockScheduleNotificationAdapter;

  beforeEach(() => {
    prefsStore.clear();
    mock = new MockScheduleNotificationAdapter();
    setScheduleNotificationAdapter(mock);
  });

  afterEach(() => {
    resetScheduleNotificationAdapter();
    vi.clearAllMocks();
  });

  it('exports NOTIFICATION_PERMISSION_DENIED_MESSAGE', () => {
    expect(NOTIFICATION_PERMISSION_DENIED_MESSAGE).toContain('permission denied');
  });

  it('initialize creates the notification channel', async () => {
    await scheduleNotificationService.initialize();
    expect(mock.channels).toHaveLength(1);
    expect(mock.channels[0].id).toBe(SCHEDULE_NOTIFICATION_CHANNEL_ID);
  });

  it('initialize is a no-op when adapter is not available', async () => {
    mock.available = false;
    await scheduleNotificationService.initialize();
    expect(mock.channels).toHaveLength(0);
  });

  it('checkPermission returns granted when adapter reports granted', async () => {
    mock.permission = 'granted';
    expect(await scheduleNotificationService.checkPermission()).toBe('granted');
  });

  it('checkPermission returns denied when adapter is not available', async () => {
    mock.available = false;
    expect(await scheduleNotificationService.checkPermission()).toBe('denied');
  });

  it('requestPermission returns true when adapter grants', async () => {
    mock.permission = 'granted';
    expect(await scheduleNotificationService.requestPermission()).toBe(true);
  });

  it('requestPermission returns false when adapter denies', async () => {
    mock.permission = 'denied';
    expect(await scheduleNotificationService.requestPermission()).toBe(false);
  });

  it('requestPermission returns false when adapter is not available', async () => {
    mock.available = false;
    expect(await scheduleNotificationService.requestPermission()).toBe(false);
  });

  it('rebuildFromMirror schedules enabled schedules with future next_run_at', async () => {
    const schedule = sampleSchedule({ id: 5, vibe_id: 20, name: 'Evening wind-down' });
    await scheduleNotificationService.rebuildFromMirror([schedule]);

    expect(mock.scheduled).toHaveLength(1);
    expect(mock.scheduled[0].id).toBe(5);
    expect(mock.scheduled[0].title).toBe('Evening wind-down');
    expect(mock.scheduled[0].extra.schedule_id).toBe(5);
    expect(mock.scheduled[0].extra.vibe_id).toBe(20);
    expect(mock.scheduled[0].channelId).toBe(SCHEDULE_NOTIFICATION_CHANNEL_ID);
  });

  it('rebuildFromMirror ignores disabled schedules', async () => {
    await scheduleNotificationService.rebuildFromMirror([
      sampleSchedule({ id: 1, is_enabled: false }),
    ]);
    expect(mock.scheduled).toHaveLength(0);
  });

  it('rebuildFromMirror ignores schedules with null next_run_at', async () => {
    await scheduleNotificationService.rebuildFromMirror([
      sampleSchedule({ id: 1, next_run_at: null }),
    ]);
    expect(mock.scheduled).toHaveLength(0);
  });

  it('rebuildFromMirror ignores schedules with past next_run_at', async () => {
    await scheduleNotificationService.rebuildFromMirror([
      sampleSchedule({ id: 1, next_run_at: '2020-01-01T00:00:00.000Z' }),
    ]);
    expect(mock.scheduled).toHaveLength(0);
  });

  it('rebuildFromMirror is a no-op when permission is denied', async () => {
    mock.permission = 'denied';
    await scheduleNotificationService.rebuildFromMirror([sampleSchedule()]);
    expect(mock.scheduled).toHaveLength(0);
  });

  it('rebuildFromMirror cancels previous notifications before scheduling new ones', async () => {
    // First build
    await scheduleNotificationService.rebuildFromMirror([sampleSchedule({ id: 1 })]);
    expect(mock.scheduled).toHaveLength(1);

    // Second build with different schedule — first one must be cancelled
    await scheduleNotificationService.rebuildFromMirror([sampleSchedule({ id: 2 })]);
    expect(mock.cancelled).toContain(1);
    expect(mock.scheduled).toHaveLength(1);
    expect(mock.scheduled[0].id).toBe(2);
  });

  it('cancelAll cancels persisted notification ids and clears prefs', async () => {
    await scheduleNotificationService.rebuildFromMirror([
      sampleSchedule({ id: 3 }),
      sampleSchedule({ id: 4 }),
    ]);

    mock.cancelled = [];
    await scheduleNotificationService.cancelAll();

    expect(mock.cancelled).toContain(3);
    expect(mock.cancelled).toContain(4);
  });

  it('rebuild is idempotent — calling twice produces one set of scheduled notifications', async () => {
    const schedules = [sampleSchedule({ id: 1 }), sampleSchedule({ id: 2 })];
    await scheduleNotificationService.rebuildFromMirror(schedules);
    await scheduleNotificationService.rebuildFromMirror(schedules);

    // After two rebuilds only the latest set should exist
    const ids = mock.scheduled.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining([1, 2]));
    expect(ids).toHaveLength(2);
  });

  it('notification payload contains schedule_id, vibe_id, schedule_name', async () => {
    const s = sampleSchedule({ id: 7, vibe_id: 99, name: 'Focus block' });
    await scheduleNotificationService.rebuildFromMirror([s]);

    const extra = mock.scheduled[0].extra;
    expect(extra).toMatchObject({
      schedule_id: 7,
      vibe_id: 99,
      schedule_name: 'Focus block',
    });
  });

  it('registerTapHandler wires the adapter tap listener', async () => {
    const received: ScheduleNotificationExtra[] = [];
    await scheduleNotificationService.registerTapHandler((e) => received.push(e));

    expect(mock.tapHandler).toBeTruthy();

    // Simulate tap
    mock.tapHandler!({ schedule_id: 1, vibe_id: 5, schedule_name: 'Test' });
    expect(received).toHaveLength(1);
    expect(received[0].vibe_id).toBe(5);
  });
});
