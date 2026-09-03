import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

export interface Scene {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenePayload {
  name: string;
  description?: string | null;
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
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getScenes(): Promise<Scene[]> {
  const res = await laravelFetch(laravelApiUrl('/api/scenes'), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Scene[] }>(res);
  return body.data;
}

async function getScene(id: number): Promise<Scene> {
  const res = await laravelFetch(laravelApiUrl(`/api/scenes/${id}`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Scene }>(res);
  return body.data;
}

async function createScene(payload: ScenePayload): Promise<Scene> {
  const res = await laravelFetch(laravelApiUrl('/api/scenes'), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Scene }>(res);
  return body.data;
}

async function updateScene(id: number, payload: Partial<ScenePayload>): Promise<Scene> {
  const res = await laravelFetch(laravelApiUrl(`/api/scenes/${id}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Scene }>(res);
  return body.data;
}

async function deleteScene(id: number): Promise<void> {
  const res = await laravelFetch(laravelApiUrl(`/api/scenes/${id}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
  });
  await handleResponse<unknown>(res);
}

export const sceneService = {
  getScenes,
  getScene,
  createScene,
  updateScene,
  deleteScene,
};
