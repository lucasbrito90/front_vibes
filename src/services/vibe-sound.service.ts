import { normalizeSoundFileUrlFromApi } from '@/utils/sound-file-url';

import { authService } from './auth.service';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export type PlayMode = 'loop' | 'once' | 'interval';

export interface VibeSound {
  id: number;
  name: string;
  /** Canonical audio URL from API (`file_url`). See {@link normalizeVibeSoundFromApi}. */
  file_url: string;
  thumbnail_url: string | null;
  category: string;
  duration: number | null;
  volume: number;
  loop: boolean;
  sort_order: number;
  play_mode: PlayMode;
  repeat_interval_seconds: number | null;
  start_offset_seconds: number | null;
  play_duration_seconds: number | null;
  fade_in_seconds: number | null;
  fade_out_seconds: number | null;
}

export interface AttachSoundPayload {
  sound_id: number;
  volume?: number;
  loop?: boolean;
  sort_order?: number;
  play_mode?: PlayMode;
  repeat_interval_seconds?: number | null;
  start_offset_seconds?: number | null;
  play_duration_seconds?: number | null;
  fade_in_seconds?: number | null;
  fade_out_seconds?: number | null;
}

export interface UpdateVibeSoundPayload {
  volume?: number;
  loop?: boolean;
  sort_order?: number;
  play_mode?: PlayMode;
  repeat_interval_seconds?: number | null;
  start_offset_seconds?: number | null;
  play_duration_seconds?: number | null;
  fade_in_seconds?: number | null;
  fade_out_seconds?: number | null;
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

/** Maps API row → `VibeSound`, collapsing legacy `audio_url` into `file_url`. */
function normalizeVibeSoundFromApi(row: VibeSound & { audio_url?: string | null }): VibeSound {
  return { ...row, file_url: normalizeSoundFileUrlFromApi(row) };
}

async function getVibeSounds(vibeId: number): Promise<VibeSound[]> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${vibeId}/sounds`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: (VibeSound & { audio_url?: string | null })[] }>(res);

  return body.data.map(normalizeVibeSoundFromApi);
}

async function attachSoundToVibe(vibeId: number, payload: AttachSoundPayload): Promise<VibeSound> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${vibeId}/sounds`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: VibeSound & { audio_url?: string | null } }>(res);

  return normalizeVibeSoundFromApi(body.data);
}

async function updateVibeSound(
  vibeId: number,
  soundId: number,
  payload: UpdateVibeSoundPayload,
): Promise<VibeSound> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${vibeId}/sounds/${soundId}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: VibeSound & { audio_url?: string | null } }>(res);

  return normalizeVibeSoundFromApi(body.data);
}

async function removeSoundFromVibe(vibeId: number, soundId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/vibes/${vibeId}/sounds/${soundId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await handleResponse<unknown>(res);
}

export const vibeSoundService = {
  getVibeSounds,
  attachSoundToVibe,
  updateVibeSound,
  removeSoundFromVibe,
};
