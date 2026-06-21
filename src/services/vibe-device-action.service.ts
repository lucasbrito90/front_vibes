import { getRequiredIdToken } from './auth.service';
import {
  DeviceOfflineError,
  isDeviceOffline,
} from './provider-connection.service';
import type { DeviceStatus } from './device.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Smart Home MVP — online-only vibe device action client (Phase 7B).
 *
 * Talks to the Laravel `/api/vibes/{vibe}/device-actions` resource (backend
 * Phase 7A) using the same Firebase Bearer + `laravelFetch` transport as the
 * other Smart Home clients. The backend is authoritative for ownership,
 * validation, and `sort_order` persistence (ADR-015).
 *
 * Hard boundaries:
 * - Online only. Create / update / delete / reorder are blocked while offline.
 * - Mobile NEVER calls Home Assistant directly and NEVER executes actions —
 *   this is pure association metadata. Execution arrives in Phases 8–9.
 * - MVP action types only: turn_on, turn_off, toggle.
 */

/** MVP-supported action types, mirrored from the backend ActionType enum. */
export type ActionType = 'turn_on' | 'turn_off' | 'toggle';

/** Nested device summary returned alongside each action. */
export interface VibeDeviceActionDevice {
  id: number;
  name: string;
  type: string | null;
  provider: string;
  status: DeviceStatus | string;
  provider_device_id: string;
}

/** A device action attached to a vibe, as returned by the API. */
export interface VibeDeviceAction {
  id: number;
  vibe_id: number;
  device_id: number;
  action_type: ActionType | string;
  parameters: Record<string, unknown> | null;
  sort_order: number;
  delay_seconds: number;
  created_at: string | null;
  updated_at: string | null;
  device?: VibeDeviceActionDevice;
}

/** Create / update payload. All fields optional on update (partial). */
export interface VibeDeviceActionPayload {
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

function basePath(vibeId: number): string {
  return `/api/vibes/${vibeId}/device-actions`;
}

async function listVibeDeviceActions(vibeId: number): Promise<VibeDeviceAction[]> {
  const res = await laravelFetch(laravelApiUrl(basePath(vibeId)), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: VibeDeviceAction[] }>(res);
  return body.data;
}

async function createVibeDeviceAction(
  vibeId: number,
  payload: VibeDeviceActionPayload,
): Promise<VibeDeviceAction> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(basePath(vibeId)), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: VibeDeviceAction }>(res);
  return body.data;
}

async function updateVibeDeviceAction(
  vibeId: number,
  actionId: number,
  payload: VibeDeviceActionPayload,
): Promise<VibeDeviceAction> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(vibeId)}/${actionId}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: VibeDeviceAction }>(res);
  return body.data;
}

async function deleteVibeDeviceAction(vibeId: number, actionId: number): Promise<void> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(vibeId)}/${actionId}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

async function reorderVibeDeviceActions(
  vibeId: number,
  orderedIds: number[],
): Promise<VibeDeviceAction[]> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`${basePath(vibeId)}/reorder`), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  const body = await handleResponse<{ data: VibeDeviceAction[] }>(res);
  return body.data;
}

export const vibeDeviceActionService = {
  listVibeDeviceActions,
  createVibeDeviceAction,
  updateVibeDeviceAction,
  deleteVibeDeviceAction,
  reorderVibeDeviceActions,
};
