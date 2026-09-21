import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch } from './laravel-http';

/**
 * scene-action-execution-report.service.ts
 *
 * Thin HTTP client for POST /api/scene-action-executions/report (P07/ADR-036
 * Decision 7) — the endpoint the mobile runtime uses to report the outcome
 * of a device-side action it executed itself (today, Google Home).
 *
 * Outcome vocabulary mirrors the backend's SmartHomeActionOutcome, minus
 * SkippedUnsupportedExecution — that value is generated server-side by the
 * scheduler (ADR-036 Decision 5) and is meaningless from a client that
 * executed the action itself; ReportSceneActionExecutionRequest rejects it.
 *
 * Idempotent server-side on (scene_execution_id, scene_action_id) — a caller
 * may report the same key twice without creating a duplicate row.
 *
 * Fire-and-forget by contract: this client never throws its own error type
 * beyond a plain Error on a non-2xx response — callers (the orchestration
 * layer) are responsible for catching and never letting a report failure
 * propagate anywhere that could interrupt audio.
 */

export type SceneActionExecutionOutcome = 'success' | 'failure' | 'unsupported' | 'unknown';

export interface ReportSceneActionExecutionPayload {
  scene_execution_id: string;
  scene_action_id: number;
  outcome: SceneActionExecutionOutcome;
  duration_ms?: number | null;
}

async function reportSceneActionExecution(payload: ReportSceneActionExecutionPayload): Promise<void> {
  const token = await getRequiredIdToken();

  const res = await laravelFetch(laravelApiUrl('/api/scene-action-executions/report'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

export const sceneActionExecutionReportService = {
  reportSceneActionExecution,
};
