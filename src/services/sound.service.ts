import { authService } from './auth.service';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface Sound {
  id: number;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  category: string;
  duration: number | null;
  created_at: string;
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

async function getSounds(): Promise<Sound[]> {
  const res = await fetch(`${API_BASE_URL}/api/sounds`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: Sound[] }>(res);
  return body.data;
}

export const soundService = { getSounds };
