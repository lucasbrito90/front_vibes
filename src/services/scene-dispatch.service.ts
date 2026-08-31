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

export const sceneDispatchService = {
  executeScene,
};
