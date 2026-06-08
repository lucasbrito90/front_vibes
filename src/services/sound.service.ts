import { normalizeSoundFileUrlFromApi } from '@/utils/sound-file-url';

import { authService } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';

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

async function handleResponse<T>(res: LaravelHttpResponse): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getSounds(): Promise<Sound[]> {
  const res = await laravelFetch(laravelApiUrl('/api/sounds'), {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: (Sound & { audio_url?: string | null })[] }>(res);

  return body.data.map((row) => ({
    ...row,
    file_url: normalizeSoundFileUrlFromApi(row),
  }));
}

export const soundService = { getSounds };
