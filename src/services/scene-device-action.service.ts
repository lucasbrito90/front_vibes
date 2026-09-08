import { getRequiredIdToken } from './auth.service';
import {
  DeviceOfflineError,
  isDeviceOffline,
} from './provider-connection.service';
import type { DeviceStatus } from './device.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Smart Home MVP — online-only scene action client.
 *
 * Talks to the Laravel `/api/scenes/{scene}/actions` resource using the same
 * Firebase Bearer + `laravelFetch` transport as the other Smart Home clients.
 *
 * Hard boundaries:
 * - Online only. Create / update / delete / reorder are blocked while offline.
 * - Mobile NEVER calls Home Assistant directly and NEVER executes actions —
 *   this is pure association metadata.
 * - MVP action types only: turn_on, turn_off, toggle.
 */

/** MVP-supported action types, mirrored from the backend ActionType enum. */
export type ActionType = 'turn_on' | 'turn_off' | 'toggle';

/** Nested device summary returned alongside each action. */
export interface SceneDeviceActionDevice {
  id: number;
  name: string;
  type: string | null;
  provider: string;
  status: DeviceStatus | string;
  provider_device_id: string;
  /**
   * ADR-033: capability map — same semantics as Device.capabilities.
   * `null` = unknown → fail-open (all action options shown).
   */
  capabilities: Record<string, Record<string, unknown>> | null;
}

/** A device action attached to a scene, as returned by the API. */
export interface SceneDeviceAction {
  id: number;
  scene_id: number;
  device_id: number;
  action_type: ActionType | string;
  parameters: Record<string, unknown> | null;
  sort_order: number;
  delay_seconds: number;
  created_at: string | null;
  updated_at: string | null;
  device?: SceneDeviceActionDevice;
}

/** Create / update payload. All fields optional on update (partial). */
export interface SceneDeviceActionPayload {
  device_id?: number;
  action_type?: ActionType;
  parameters?: Record<string, unknown> | null;
  delay_seconds?: number;
  sort_order?: number;
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

function basePath(sceneId: number): string {
  return `/api/scenes/${sceneId}/actions`;
}

async function listSceneDeviceActions(sceneId: number): Promise<SceneDeviceAction[]> {
  const res = await laravelFetch(laravelApiUrl(basePath(sceneId)), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: SceneDeviceAction[] }>(res);
  return body.data;
}

async function createSceneDeviceAction(
  sceneId: number,
  payload: SceneDeviceActionPayload,
): Promise<SceneDeviceAction> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(basePath(sceneId)), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: SceneDeviceAction }>(res);
  return body.data;
}

async function updateSceneDeviceAction(
  sceneId: number,
  actionId: number,
  payload: SceneDeviceActionPayload,
): Promise<SceneDeviceAction> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(sceneId)}/${actionId}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: SceneDeviceAction }>(res);
  return body.data;
}

async function deleteSceneDeviceAction(sceneId: number, actionId: number): Promise<void> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(sceneId)}/${actionId}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

async function reorderSceneDeviceActions(
  sceneId: number,
  orderedIds: number[],
): Promise<SceneDeviceAction[]> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(sceneId)}/reorder`), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  const body = await handleResponse<{ data: SceneDeviceAction[] }>(res);
  return body.data;
}

export const sceneDeviceActionService = {
  listSceneDeviceActions,
  createSceneDeviceAction,
  updateSceneDeviceAction,
  deleteSceneDeviceAction,
  reorderSceneDeviceActions,
};
