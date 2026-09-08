import { getRequiredIdToken } from './auth.service';
import {
  DeviceOfflineError,
  isDeviceOffline,
} from './provider-connection.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Manual scene execution — online-only client.
 *
 * POST /api/scenes/{scene}/execute enqueues Smart Home jobs and returns
 * dispatch counts immediately (fire-and-forget). Unlike vibe playback dispatch,
 * this is an explicit user action and must surface results and offline guards.
 */

export interface SceneDispatchResult {
  scene_id: number;
  dispatched: number;
  skipped: number;
  action_ids: number[];
  /** T21: execution ID for polling results via GET /api/scenes/{id}/executions/{executionId}. */
  scene_execution_id: string;
}

/** Per-provider breakdown in a SceneExecutionSummary. */
export interface SceneExecutionByProvider {
  provider: string;
  count_success: number;
  count_non_success: number;
}

/**
 * Aggregated execution result from GET /api/scenes/{scene}/executions/{sceneExecutionId}.
 * `state` is one of: 'no_actions' | 'success' | 'failure' | 'partial_success'.
 * `actions` is not used in this context — typed as unknown[] to avoid over-specifying.
 */
export interface SceneExecutionSummary {
  scene_execution_id: string;
  scene_id: number;
  state: 'no_actions' | 'success' | 'failure' | 'partial_success';
  count_success: number;
  count_non_success: number;
  count_total: number;
  executed_at: string;
  by_provider: SceneExecutionByProvider[];
  actions: unknown[];
}

async function protectedAuthHeaders(): Promise<HeadersInit> {
  const token = await getRequiredIdToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function assertOnlineForMutation(): void {
  if (isDeviceOffline()) {
    throw new DeviceOfflineError();
  }
}

async function handleResponse<T>(res: LaravelHttpResponse): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function executeScene(sceneId: number): Promise<SceneDispatchResult> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/scenes/${sceneId}/execute`), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: SceneDispatchResult }>(res);
  return body.data;
}

/**
 * Fetches the aggregated execution result for a dispatched scene.
 * Returns null (rather than throwing) for 404 — the execution row may not
 * exist yet immediately after dispatch (async job pipeline).
 */
async function getExecutionSummary(
  sceneId: number,
  sceneExecutionId: string,
): Promise<SceneExecutionSummary | null> {
  const res = await laravelFetch(
    laravelApiUrl(`/api/scenes/${sceneId}/executions/${sceneExecutionId}`),
    { headers: await protectedAuthHeaders() },
  );
  if (res.status === 404) return null;
  const body = await handleResponse<{ data: SceneExecutionSummary }>(res);
  return body.data;
}

export const sceneDispatchService = {
  executeScene,
  getExecutionSummary,
};
