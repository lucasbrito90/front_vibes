import type {
  AnyRecurrenceType,
  RecurrenceType,
  Schedule,
} from '@/services/schedule.service';
import { formatInstantInZone } from '@/utils/schedule-datetime';

/** ISO-8601 weekday options — Monday = 1 … Sunday = 7. */
export interface WeekdayOption {
  iso: number;
  short: string;
  label: string;
}

export const WEEKDAY_OPTIONS: readonly WeekdayOption[] = [
  { iso: 1, short: 'Mon', label: 'Monday' },
  { iso: 2, short: 'Tue', label: 'Tuesday' },
  { iso: 3, short: 'Wed', label: 'Wednesday' },
  { iso: 4, short: 'Thu', label: 'Thursday' },
  { iso: 5, short: 'Fri', label: 'Friday' },
  { iso: 6, short: 'Sat', label: 'Saturday' },
  { iso: 7, short: 'Sun', label: 'Sunday' },
] as const;

const RECURRENCE_LABELS: Record<AnyRecurrenceType, string> = {
  once: 'Once',
  daily: 'Daily',
  weekdays: 'Weekdays (Mon–Fri)',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** Human label for a recurrence type. */
export function recurrenceTypeLabel(type: AnyRecurrenceType): string {
  return RECURRENCE_LABELS[type] ?? type;
}

/**
 * Whether a `weekly` recurrence has a valid non-empty day selection. For non-weekly
 * types the config is irrelevant, so they are always valid here.
 */
export function isWeeklyConfigValid(
  type: RecurrenceType,
  days: number[] | undefined | null,
): boolean {
  if (type !== 'weekly') return true;
  if (!Array.isArray(days) || days.length === 0) return false;
  return days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

/** Short comma-separated weekday list (in ISO order) for a weekly selection. */
export function formatWeekdayList(days: number[]): string {
  const ordered = WEEKDAY_OPTIONS.filter((opt) => days.includes(opt.iso));
  if (ordered.length === 0) return '';
  return ordered.map((opt) => opt.short).join(', ');
}

/** One-line recurrence summary for list/detail display. */
export function recurrenceSummary(schedule: Pick<Schedule, 'recurrence_type' | 'recurrence_config'>): string {
  if (schedule.recurrence_type === 'weekly') {
    const days = schedule.recurrence_config?.days_of_week ?? [];
    const list = formatWeekdayList(days);
    return list ? `Weekly · ${list}` : 'Weekly';
  }
  return recurrenceTypeLabel(schedule.recurrence_type);
}

/** Format `next_run_at` in the schedule's timezone for display. */
export function formatNextRun(schedule: Pick<Schedule, 'next_run_at' | 'timezone'>): string {
  return formatInstantInZone(schedule.next_run_at, schedule.timezone);
}
