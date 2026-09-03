import { getRequiredIdToken } from './auth.service';
import { laravelApiUrl, laravelFetch, type LaravelHttpResponse } from './laravel-http';
import type { VibeSound } from './vibe-sound.service';

export interface Vibe {
  id: number;
  name: string;
  description: string | null;

  /**
   * Legacy artwork field. The API falls back to this when the dedicated
   * context-specific fields below are null. Do not use directly in new UI —
   * prefer the resolved fields (card_image_url, player_background_url,
   * artwork_url) which already incorporate the thumbnail_url fallback.
   */
  thumbnail_url: string | null;

  /**
   * Image shown on the vibe card in the /vibes list (square or wide crop).
   * The API resolves this as: card_image_url ?? thumbnail_url.
   */
  card_image_url: string | null;

  /**
   * Full-screen background image for the player page (portrait, high-res).
   * The API resolves this as: player_background_url ?? thumbnail_url.
   */
  player_background_url: string | null;

  /**
   * Artwork shown in the Android MediaSession notification and lock screen
   * (square, typically 512 × 512 px).
   * The API resolves this as: artwork_url ?? thumbnail_url.
   */
  artwork_url: string | null;

  is_active: boolean;
  sounds_count?: number;
  /** Present when the API embeds layers (e.g. preset import response). */
  sounds?: VibeSound[];

  // ── Phase 5A read-model enrichment (optional for backward compatibility) ──
  /** Number of enabled schedules that reference this vibe. */
  active_schedules_count?: number;
  /** Convenience flag — true when at least one enabled schedule references this vibe. */
  has_active_schedule?: boolean;

  /** Linked Smart Home scene (nullable). Actions run via this scene on dispatch. */
  scene_id?: number | null;

  created_at: string;
  updated_at: string;
}

export interface VibePayload {
  name: string;
  description?: string | null;
  is_active?: boolean;
  thumbnail_url?: string | null;
  artwork_url?: string | null;
  player_background_url?: string | null;
  scene_id?: number | null;
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

async function getVibes(): Promise<Vibe[]> {
  const res = await laravelFetch(laravelApiUrl('/api/vibes'), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Vibe[] }>(res);
  return body.data;
}

async function getVibe(id: number): Promise<Vibe> {
  const res = await laravelFetch(laravelApiUrl(`/api/vibes/${id}`), {
    headers: await protectedAuthHeaders(),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function createVibe(payload: VibePayload): Promise<Vibe> {
  const res = await laravelFetch(laravelApiUrl('/api/vibes'), {
    method: 'POST',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function updateVibe(id: number, payload: Partial<VibePayload>): Promise<Vibe> {
  const res = await laravelFetch(laravelApiUrl(`/api/vibes/${id}`), {
    method: 'PATCH',
    headers: await protectedAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: Vibe }>(res);
  return body.data;
}

async function deleteVibe(id: number): Promise<void> {
  const res = await laravelFetch(laravelApiUrl(`/api/vibes/${id}`), {
    method: 'DELETE',
    headers: await protectedAuthHeaders(),
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
