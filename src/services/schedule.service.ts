import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Scheduler MVP — online-only schedule CRUD client.
 *
 * Talks to the Laravel `/api/schedules` resource using the same Firebase Bearer +
 * `laravelFetch` transport as `vibe.service.ts`. The backend is authoritative for
 * `next_run_at`, ownership, recurrence math, and timezone expansion (ADR-009).
 *
 * Hard boundaries (Scheduler spec / ADR-011):
 * - Online only. Create / update / delete are blocked while the device is offline.
 * - SQLite mirror (read-only offline) lives in `schedule-mirror.service.ts`.
 * - No local notifications, no FCM — those are later phases.
 * - `monthly` recurrence is reserved in the type but NOT selectable in the MVP.
 */

/** MVP-selectable recurrence types. `monthly` is reserved but never offered. */
export type RecurrenceType = 'once' | 'daily' | 'weekdays' | 'weekly';

/** Reserved recurrence slot — present for forward-compatible typing only, not selectable. */
export type ReservedRecurrenceType = 'monthly';

/** Any recurrence value the API may theoretically return (including the reserved slot). */
export type AnyRecurrenceType = RecurrenceType | ReservedRecurrenceType;

/** Recurrence types the mobile UI is allowed to offer in the MVP. */
export const SELECTABLE_RECURRENCE_TYPES: readonly RecurrenceType[] = [
  'once',
  'daily',
  'weekdays',
  'weekly',
] as const;

export interface RecurrenceConfig {
  /** ISO-8601 weekday numbers — Monday = 1 … Sunday = 7. Required for `weekly`. */
  days_of_week?: number[];
}

export interface Schedule {
  id: number;
  vibe_id: number;
  name: string;
  /** IANA timezone identifier owned by the schedule (e.g. `America/Sao_Paulo`). */
  timezone: string;
  /** First anchor instant, UTC ISO string. */
  start_time: string | null;
  recurrence_type: AnyRecurrenceType;
  recurrence_config: RecurrenceConfig | null;
  is_enabled: boolean;
  /** Next due instant, UTC ISO string (server-computed). */
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SchedulePayload {
  vibe_id: number;
  name: string;
  timezone: string;
  /** UTC ISO-8601 instant. Convert wall-clock + timezone before sending (ADR-009). */
  start_time: string;
  recurrence_type: RecurrenceType;
  recurrence_config?: RecurrenceConfig | null;
  is_enabled?: boolean;
}

/** Shown when a mutation is attempted offline. */
export const SCHEDULE_OFFLINE_MUTATION_MESSAGE =
  'Schedules can only be changed while online.';

/** Thrown by mutating service calls when the device has no network connectivity. */
export class ScheduleOfflineError extends Error {
  constructor(message: string = SCHEDULE_OFFLINE_MUTATION_MESSAGE) {
    super(message);
    this.name = 'ScheduleOfflineError';
  }
}

/** True when the device reports being offline. */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function assertOnlineForMutation(): void {
  if (isDeviceOffline()) {
    throw new ScheduleOfflineError();
  }
}

async function protectedAuthHeaders(): Promise<HeadersInit> {
  const token = await getRequiredIdToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: LaravelHttpResponse): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function getSchedules(): Promise<Schedule[]> {
  const res = await laravelFetch(laravelApiUrl('/api/schedules'), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Schedule[] }>(res);
  return body.data;
}

async function getSchedule(id: number): Promise<Schedule> {
  const res = await laravelFetch(laravelApiUrl(`/api/schedules/${id}`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Schedule }>(res);
  return body.data;
}

async function createSchedule(payload: SchedulePayload): Promise<Schedule> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl('/api/schedules'), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Schedule }>(res);
  return body.data;
}

async function updateSchedule(id: number, payload: Partial<SchedulePayload>): Promise<Schedule> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/schedules/${id}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Schedule }>(res);
  return body.data;
}

async function deleteSchedule(id: number): Promise<void> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/schedules/${id}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

export const scheduleService = {
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};
