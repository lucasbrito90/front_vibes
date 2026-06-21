import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

/**
 * Smart Home MVP — online-only provider connection client (Phase 6).
 *
 * Talks to the Laravel `/api/provider-connections` resource using the same
 * Firebase Bearer + `laravelFetch` transport as `schedule.service.ts`. The
 * backend is authoritative for credential encryption, device sync, and
 * connection health (ADR-012, ADR-013).
 *
 * Hard boundaries:
 * - Online only. Create / update / delete / sync are blocked while offline.
 * - Mobile NEVER calls Home Assistant directly — all provider traffic is
 *   server-side via the Laravel API.
 * - The Home Assistant access token is write-only: it is sent once on create
 *   and NEVER returned by the API, never logged, and never stored locally.
 */

/** Provider slugs the mobile UI may offer. MVP: Home Assistant only. */
export type ProviderSlug = 'home_assistant';

/** Provider connection health, mirrored from the backend ConnectionStatus enum. */
export type ConnectionStatus = 'connected' | 'unreachable' | 'unknown';

export interface ProviderConnectionConfig {
  base_url: string;
}

/**
 * Provider connection as returned by the API. Note: there is intentionally NO
 * `access_token` / `encrypted_credentials` field — the backend never exposes it.
 */
export interface ProviderConnection {
  id: number;
  name: string;
  provider: ProviderSlug | string;
  config: ProviderConnectionConfig;
  status: ConnectionStatus | string;
  last_tested_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Create payload. `access_token` is nested under `encrypted_credentials` per the API contract. */
export interface ProviderConnectionPayload {
  name: string;
  provider: ProviderSlug;
  config: ProviderConnectionConfig;
  encrypted_credentials: {
    access_token: string;
  };
}

/** Partial update payload — name / config / token only. */
export interface ProviderConnectionUpdatePayload {
  name?: string;
  config?: ProviderConnectionConfig;
  encrypted_credentials?: {
    access_token: string;
  };
}

/** Summary returned by the sync endpoint. */
export interface ProviderSyncResult {
  provider_connection_id: number;
  synced: number;
  created: number;
  updated: number;
  offline: number;
  status: ConnectionStatus | string;
}

/** Shown when a mutation is attempted offline. */
export const DEVICE_OFFLINE_MUTATION_MESSAGE = 'Devices can only be changed while online.';

/** Thrown by mutating service calls when the device has no network connectivity. */
export class DeviceOfflineError extends Error {
  constructor(message: string = DEVICE_OFFLINE_MUTATION_MESSAGE) {
    super(message);
    this.name = 'DeviceOfflineError';
  }
}

/** True when the device reports being offline. */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function assertOnlineForMutation(): void {
  if (isDeviceOffline()) {
    throw new DeviceOfflineError();
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

async function getProviderConnections(): Promise<ProviderConnection[]> {
  const res = await laravelFetch(laravelApiUrl('/api/provider-connections'), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: ProviderConnection[] }>(res);
  return body.data;
}

async function getProviderConnection(id: number): Promise<ProviderConnection> {
  const res = await laravelFetch(laravelApiUrl(`/api/provider-connections/${id}`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: ProviderConnection }>(res);
  return body.data;
}

async function createProviderConnection(
  payload: ProviderConnectionPayload,
): Promise<ProviderConnection> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl('/api/provider-connections'), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: ProviderConnection }>(res);
  return body.data;
}

async function updateProviderConnection(
  id: number,
  payload: ProviderConnectionUpdatePayload,
): Promise<ProviderConnection> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/provider-connections/${id}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: ProviderConnection }>(res);
  return body.data;
}

async function deleteProviderConnection(id: number): Promise<void> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/provider-connections/${id}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message ?? `Request failed: ${res.status}`);
  }
}

async function syncProviderConnection(id: number): Promise<ProviderSyncResult> {
  assertOnlineForMutation();
  const res = await laravelFetch(laravelApiUrl(`/api/provider-connections/${id}/sync`), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: ProviderSyncResult }>(res);
  return body.data;
}

export const providerConnectionService = {
  getProviderConnections,
  getProviderConnection,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  syncProviderConnection,
};
