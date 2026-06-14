import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Scheduler MVP Phase 11 — Execution Log Sync client.
 *
 * Provides read access to schedule execution history and a best-effort
 * acknowledgement endpoint for notification tap events.
 *
 * Hard boundaries (Phase 11 / ADR-011):
 * - No offline mutation queue — ack is fire-and-forget best-effort.
 * - Ack does NOT guarantee playback.
 * - No FCM — local notifications only (ADR-011).
 */

export interface ScheduleExecution {
  id: number;
  schedule_id: number;
  /** Format: `{schedule_id}:{scheduled_for_unix}` per ADR-010. */
  occurrence_key: string;
  scheduled_for: string | null;
  executed_at: string | null;
  /** `dispatched` | `acknowledged` | `failed` | `skipped` */
  status: string;
  log: string | null;
  created_at: string | null;
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

/**
 * Fetch paginated execution history for a schedule (most-recent first).
 * Returns the first page (up to 20 rows).
 */
async function listScheduleExecutions(scheduleId: number): Promise<ScheduleExecution[]> {
  const res = await laravelFetch(laravelApiUrl(`/api/schedules/${scheduleId}/executions`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: ScheduleExecution[] }>(res);
  return body.data;
}

/**
 * Report that the user tapped / opened a schedule notification.
 * Transitions backend execution status to `acknowledged` (idempotent).
 * Does NOT guarantee or trigger playback.
 *
 * The occurrence_key is URL-encoded to safely handle the embedded `:` separator.
 */
async function acknowledgeScheduleExecution(
  scheduleId: number,
  occurrenceKey: string,
): Promise<ScheduleExecution> {
  const encodedKey = encodeURIComponent(occurrenceKey);
  const res = await laravelFetch(
    laravelApiUrl(`/api/schedules/${scheduleId}/executions/${encodedKey}/ack`),
    {
      method: 'POST',
      headers: await protectedAuthHeaders(),
    },
  );
  const body = await handleResponse<{ data: ScheduleExecution }>(res);
  return body.data;
}

export const scheduleExecutionService = {
  listScheduleExecutions,
  acknowledgeScheduleExecution,
};
