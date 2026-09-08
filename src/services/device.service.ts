import { getRequiredIdToken } from './auth.service';
import {
  DeviceOfflineError,
  isDeviceOffline,
} from './provider-connection.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Smart Home MVP — online-only device client (Phase 6).
 *
 * Talks to the Laravel `/api/devices` resource. The device registry is
 * server-authoritative (ADR-014): devices are created/updated by provider sync
 * server-side, and the mobile app reads/edits the normalised IXORA records.
 *
 * Hard boundaries:
 * - Online only. Create / update / delete are blocked while offline.
 * - Mobile never calls Home Assistant directly — all provider traffic is
 *   server-side. There is no on-device execution of device actions in MVP.
 */

/** Normalised device status, mirrored from the backend DeviceStatus enum. */
export type DeviceStatus = 'online' | 'offline' | 'unknown';

export interface Device {
  id: number;
  provider_connection_id: number;
  name: string;
  type: string;
  provider: string;
  provider_device_id: string;
  status: DeviceStatus | string;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  /**
   * ADR-033: capability map (capability slug → constraint object, `{}` for boolean caps).
   * `null` means unknown — fail-open: never block an action when capabilities is null.
   */
  capabilities: Record<string, Record<string, unknown>> | null;
}

/** Create payload — manual device creation (optional MVP path). */
export interface DevicePayload {
  provider_connection_id: number;
  name: string;
  type?: string;
  provider_device_id: string;
}

/** Partial update payload — rename / type label only. */
export interface DeviceUpdatePayload {
  name?: string;
  type?: string;
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

async function getDevices(): Promise<Device[]> {
  const res = await laravelFetch(laravelApiUrl('/api/devices'), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Device[] }>(res);
  return body.data;
}

async function getDevice(id: number): Promise<Device> {
  const res = await laravelFetch(laravelApiUrl(`/api/devices/${id}`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Device }>(res);
  return body.data;
}

async function createDevice(payload: DevicePayload): Promise<Device> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl('/api/devices'), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Device }>(res);
  return body.data;
}

async function updateDevice(id: number, payload: DeviceUpdatePayload): Promise<Device> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/devices/${id}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Device }>(res);
  return body.data;
}

async function deleteDevice(id: number): Promise<void> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/devices/${id}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

export const deviceService = {
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
};
