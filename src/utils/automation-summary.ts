/**
 * Presentation helpers for the Phase 5A read-model enrichment fields
 * (Scheduler + Smart Home Automations · Phase 5B — Mobile UX Surface).
 *
 * These are pure display formatters — no async, no business logic, no I/O.
 * They tolerate missing optional fields so pages stay backward compatible with
 * API responses (or cached mirror rows) produced before Phase 5A.
 */

import type { Schedule } from '@/services/schedule.service';
import type { Vibe } from '@/services/vibe.service';

/** Wording shown when a schedule's vibe has Smart Home device actions. */
export const AUTOMATION_ENABLED_LABEL = 'Automation Enabled';

/** Wording shown in schedule details when the vibe has no device actions. */
export const NO_SMART_HOME_ACTIONS_LABEL = 'No Smart Home Actions';

/** Wording shown on a vibe that is referenced by at least one enabled schedule. */
export const AUTOMATION_ACTIVE_LABEL = 'Automation Active';

/** Wording shown in vibe details when there are no active schedules. */
export const NO_ACTIVE_SCHEDULES_LABEL = 'No active schedules';

type SchedulePart = Pick<Schedule, 'has_device_actions' | 'device_actions_count'>;
type VibePart = Pick<Vibe, 'has_active_schedule' | 'active_schedules_count'>;

function toSafeCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Whether the schedule's linked vibe has any Smart Home device action.
 * Prefers the explicit `has_device_actions` flag, falling back to the count.
 */
export function hasDeviceActions(schedule: SchedulePart | null | undefined): boolean {
  if (!schedule) return false;
  if (typeof schedule.has_device_actions === 'boolean') {
    return schedule.has_device_actions;
  }
  return toSafeCount(schedule.device_actions_count) > 0;
}

/** Badge label for the schedule list — the wording, or `null` to render nothing. */
export function scheduleAutomationBadgeLabel(
  schedule: SchedulePart | null | undefined,
): string | null {
  return hasDeviceActions(schedule) ? AUTOMATION_ENABLED_LABEL : null;
}

/** Automation status line for schedule details — always returns a readable label. */
export function scheduleAutomationStatusLabel(
  schedule: SchedulePart | null | undefined,
): string {
  return hasDeviceActions(schedule) ? AUTOMATION_ENABLED_LABEL : NO_SMART_HOME_ACTIONS_LABEL;
}

/**
 * Resolve the vibe name for a schedule, preferring the API-provided `vibe_name`.
 * Falls back to a caller-supplied name (e.g. from a locally cached vibe list),
 * then to a stable `Vibe #id` placeholder.
 */
export function resolveScheduleVibeName(
  schedule: Pick<Schedule, 'vibe_id' | 'vibe_name'> | null | undefined,
  fallbackName?: string | null,
): string {
  const apiName = schedule?.vibe_name;
  if (typeof apiName === 'string' && apiName.trim().length > 0) {
    return apiName;
  }
  if (typeof fallbackName === 'string' && fallbackName.trim().length > 0) {
    return fallbackName;
  }
  return schedule ? `Vibe #${schedule.vibe_id}` : '';
}

/** Number of enabled schedules referencing a vibe (safe, never negative/NaN). */
export function activeSchedulesCount(vibe: VibePart | null | undefined): number {
  return toSafeCount(vibe?.active_schedules_count);
}

/**
 * Whether a vibe has at least one active schedule.
 * Prefers the explicit `has_active_schedule` flag, falling back to the count.
 */
export function hasActiveSchedule(vibe: VibePart | null | undefined): boolean {
  if (!vibe) return false;
  if (typeof vibe.has_active_schedule === 'boolean') {
    return vibe.has_active_schedule;
  }
  return activeSchedulesCount(vibe) > 0;
}

/** Badge label for the vibe list — the wording, or `null` to render nothing. */
export function vibeAutomationBadgeLabel(vibe: VibePart | null | undefined): string | null {
  return hasActiveSchedule(vibe) ? AUTOMATION_ACTIVE_LABEL : null;
}

/** Summary line for vibe details — `Active schedules: X` or `No active schedules`. */
export function activeSchedulesSummary(vibe: VibePart | null | undefined): string {
  const count = activeSchedulesCount(vibe);
  return count > 0 ? `Active schedules: ${count}` : NO_ACTIVE_SCHEDULES_LABEL;
}
