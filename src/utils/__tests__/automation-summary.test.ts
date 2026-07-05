import { describe, expect, it } from 'vitest';

import type { Schedule } from '@/services/schedule.service';
import type { Vibe } from '@/services/vibe.service';
import {
  AUTOMATION_ACTIVE_LABEL,
  AUTOMATION_ENABLED_LABEL,
  NO_SMART_HOME_ACTIONS_LABEL,
  VIBE_NOT_SCHEDULED_MESSAGE,
  activeSchedulesCount,
  activeSchedulesSummary,
  hasActiveSchedule,
  hasDeviceActions,
  resolveScheduleVibeName,
  scheduleAutomationBadgeLabel,
  scheduleAutomationStatusLabel,
  vibeAutomationBadgeLabel,
} from '@/utils/automation-summary';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    vibe_id: 42,
    name: 'Morning Focus',
    timezone: 'UTC',
    start_time: null,
    recurrence_type: 'daily',
    recurrence_config: null,
    is_enabled: true,
    next_run_at: null,
    last_run_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function makeVibe(overrides: Partial<Vibe> = {}): Vibe {
  return {
    id: 42,
    name: 'Rainy Night',
    description: null,
    thumbnail_url: null,
    card_image_url: null,
    player_background_url: null,
    artwork_url: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000000Z',
    updated_at: '2026-01-01T00:00:00.000000Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule → vibe name
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveScheduleVibeName', () => {
  it('renders the API-provided vibe_name when present', () => {
    const schedule = makeSchedule({ vibe_name: 'Evening Calm' });
    expect(resolveScheduleVibeName(schedule)).toBe('Evening Calm');
  });

  it('falls back to the provided name when vibe_name is missing', () => {
    const schedule = makeSchedule({ vibe_name: undefined });
    expect(resolveScheduleVibeName(schedule, 'Local Vibe')).toBe('Local Vibe');
  });

  it('falls back to Vibe #id when neither name is available', () => {
    const schedule = makeSchedule({ vibe_id: 7, vibe_name: null });
    expect(resolveScheduleVibeName(schedule)).toBe('Vibe #7');
  });

  it('ignores empty/whitespace vibe_name and uses the fallback', () => {
    const schedule = makeSchedule({ vibe_name: '   ' });
    expect(resolveScheduleVibeName(schedule, 'Fallback')).toBe('Fallback');
  });

  it('returns an empty string for a null schedule without a fallback', () => {
    expect(resolveScheduleVibeName(null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schedule → device actions / automation badge
// ─────────────────────────────────────────────────────────────────────────────

describe('hasDeviceActions', () => {
  it('is true when the has_device_actions flag is true', () => {
    expect(hasDeviceActions(makeSchedule({ has_device_actions: true }))).toBe(true);
  });

  it('is false when the has_device_actions flag is false', () => {
    expect(hasDeviceActions(makeSchedule({ has_device_actions: false }))).toBe(false);
  });

  it('derives from device_actions_count when the flag is absent', () => {
    expect(hasDeviceActions(makeSchedule({ device_actions_count: 3 }))).toBe(true);
    expect(hasDeviceActions(makeSchedule({ device_actions_count: 0 }))).toBe(false);
  });

  it('is false for backward-compatible payloads with no automation fields', () => {
    expect(hasDeviceActions(makeSchedule())).toBe(false);
  });

  it('does not throw for null/undefined input', () => {
    expect(hasDeviceActions(null)).toBe(false);
    expect(hasDeviceActions(undefined)).toBe(false);
  });
});

describe('scheduleAutomationBadgeLabel', () => {
  it('shows the badge label when the vibe has device actions', () => {
    expect(scheduleAutomationBadgeLabel(makeSchedule({ has_device_actions: true }))).toBe(
      AUTOMATION_ENABLED_LABEL,
    );
  });

  it('returns null (badge disappears) when there are no device actions', () => {
    expect(scheduleAutomationBadgeLabel(makeSchedule({ has_device_actions: false }))).toBeNull();
    expect(scheduleAutomationBadgeLabel(makeSchedule())).toBeNull();
  });
});

describe('scheduleAutomationStatusLabel', () => {
  it('reads "Automation Enabled" when device actions exist', () => {
    expect(scheduleAutomationStatusLabel(makeSchedule({ device_actions_count: 2 }))).toBe(
      AUTOMATION_ENABLED_LABEL,
    );
  });

  it('reads "No Smart Home Actions" otherwise', () => {
    expect(scheduleAutomationStatusLabel(makeSchedule())).toBe(NO_SMART_HOME_ACTIONS_LABEL);
    expect(scheduleAutomationStatusLabel(null)).toBe(NO_SMART_HOME_ACTIONS_LABEL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vibe → active schedules count / summary / badge
// ─────────────────────────────────────────────────────────────────────────────

describe('activeSchedulesCount', () => {
  it('returns the count when present', () => {
    expect(activeSchedulesCount(makeVibe({ active_schedules_count: 5 }))).toBe(5);
  });

  it('returns 0 for missing, negative, or non-finite values', () => {
    expect(activeSchedulesCount(makeVibe())).toBe(0);
    expect(activeSchedulesCount(makeVibe({ active_schedules_count: -3 }))).toBe(0);
    expect(activeSchedulesCount(makeVibe({ active_schedules_count: Number.NaN }))).toBe(0);
  });

  it('does not throw for null/undefined input', () => {
    expect(activeSchedulesCount(null)).toBe(0);
    expect(activeSchedulesCount(undefined)).toBe(0);
  });
});

describe('hasActiveSchedule', () => {
  it('prefers the explicit has_active_schedule flag', () => {
    expect(hasActiveSchedule(makeVibe({ has_active_schedule: true }))).toBe(true);
    expect(hasActiveSchedule(makeVibe({ has_active_schedule: false, active_schedules_count: 9 }))).toBe(
      false,
    );
  });

  it('derives from the count when the flag is absent', () => {
    expect(hasActiveSchedule(makeVibe({ active_schedules_count: 1 }))).toBe(true);
    expect(hasActiveSchedule(makeVibe({ active_schedules_count: 0 }))).toBe(false);
  });

  it('is false for backward-compatible payloads with no automation fields', () => {
    expect(hasActiveSchedule(makeVibe())).toBe(false);
  });
});

describe('vibeAutomationBadgeLabel', () => {
  it('shows the badge when the vibe has an active schedule', () => {
    expect(vibeAutomationBadgeLabel(makeVibe({ has_active_schedule: true }))).toBe(
      AUTOMATION_ACTIVE_LABEL,
    );
  });

  it('returns null when there is no active schedule', () => {
    expect(vibeAutomationBadgeLabel(makeVibe())).toBeNull();
    expect(vibeAutomationBadgeLabel(makeVibe({ has_active_schedule: false }))).toBeNull();
  });
});

describe('activeSchedulesSummary', () => {
  it('keeps the count and uses clearer, pluralized wording', () => {
    expect(activeSchedulesSummary(makeVibe({ active_schedules_count: 1 }))).toBe(
      'Used by 1 active schedule',
    );
    expect(activeSchedulesSummary(makeVibe({ active_schedules_count: 4 }))).toBe(
      'Used by 4 active schedules',
    );
  });

  it('renders the not-scheduled message when there are none', () => {
    expect(activeSchedulesSummary(makeVibe({ active_schedules_count: 0 }))).toBe(
      VIBE_NOT_SCHEDULED_MESSAGE,
    );
    expect(activeSchedulesSummary(makeVibe())).toBe(VIBE_NOT_SCHEDULED_MESSAGE);
    expect(activeSchedulesSummary(null)).toBe(VIBE_NOT_SCHEDULED_MESSAGE);
  });
});
