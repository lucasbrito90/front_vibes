import { authService } from './auth.service';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface Vibe {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VibePayload {
  name: string;
  description?: string | null;
  is_active?: boolean;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await authService.getIdToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getVibes(): Promise<Vibe[]> {
  const res = await fetch(`${API_BASE_URL}/api/vibes`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: Vibe[] }>(res);
  return body.data;
}

async function getVibe(id: number): Promise<Vibe> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${id}`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function createVibe(payload: VibePayload): Promise<Vibe> {
  const res = await fetch(`${API_BASE_URL}/api/vibes`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function updateVibe(id: number, payload: Partial<VibePayload>): Promise<Vibe> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function deleteVibe(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await handleResponse<unknown>(res);
}

export const vibeService = {
  getVibes,
  getVibe,
  createVibe,
  updateVibe,
  deleteVibe,
};
