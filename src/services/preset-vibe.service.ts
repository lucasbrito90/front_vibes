import { normalizeSoundFileUrlFromApi } from '@/utils/sound-file-url';

import { authService } from './auth.service';
import type { Vibe } from './vibe.service';
import type { PlayMode, VibeSound } from './vibe-sound.service';
import type { PresetCoverBundle, PresetVibe, PresetVibeSoundLayer } from '@/types/preset-vibe';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function normalizeNestedCover(raw: unknown): PresetCoverBundle | null {
  const r = asRecord(raw);
  if (!r) return null;

  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    artwork_url: r.artwork_url != null ? String(r.artwork_url) : null,
    player_background_url:
      r.player_background_url != null ? String(r.player_background_url) : null,
  };
}

function normalizePresetSoundLayer(row: Record<string, unknown>): PresetVibeSoundLayer {
  const snd = asRecord(row.sound);
  const soundName =
    snd?.name != null ? String(snd.name) : undefined;

  return {
    id: row.id != null ? Number(row.id) : Number(row.sound_id),
    sound_id: Number(row.sound_id),
    soundName,
    volume: row.volume != null ? Number(row.volume) : 100,
    play_mode: String(row.play_mode ?? 'loop'),
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
  };
}

function extractLayers(raw: Record<string, unknown>): unknown[] {
  const s = raw.sounds;
  if (Array.isArray(s)) return s;
  const p = raw.preset_vibe_sounds;
  if (Array.isArray(p)) return p;
  const l = raw.layers;
  if (Array.isArray(l)) return l;

  return [];
}

export function normalizePresetVibe(raw: Record<string, unknown>): PresetVibe {
  const layers = extractLayers(raw)
    .map((x) => normalizePresetSoundLayer(asRecord(x) ?? {}))
    .sort((a, b) => a.sort_order - b.sort_order || a.sound_id - b.sound_id);

  let tags: string[] = [];
  const tr = raw.tags;
  if (Array.isArray(tr)) tags = tr.filter((t): t is string => typeof t === 'string');

  const cbId = raw.cover_bundle_id;

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    cover_bundle_id:
      cbId === null || cbId === undefined || cbId === ''
        ? null
        : Number(cbId),
    cover_bundle: normalizeNestedCover(raw.cover_bundle),
    category: raw.category != null ? String(raw.category) : null,
    tags,
    is_active: Boolean(raw.is_active ?? true),
    layers,
  };
}

function normalizeImportedSound(row: Record<string, unknown>): VibeSound {
  const mode = (row.play_mode as PlayMode | undefined) ?? 'loop';

  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    file_url: normalizeSoundFileUrlFromApi(row),
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    category: String(row.category ?? ''),
    duration: row.duration != null && row.duration !== '' ? Number(row.duration) : null,
    volume: row.volume != null ? Number(row.volume) : 80,
    loop: Boolean(row.loop ?? mode === 'loop'),
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
    play_mode: mode,
    repeat_interval_seconds:
      row.repeat_interval_seconds != null ? Number(row.repeat_interval_seconds) : null,
    start_offset_seconds:
      row.start_offset_seconds != null ? Number(row.start_offset_seconds) : null,
    play_duration_seconds:
      row.play_duration_seconds != null ? Number(row.play_duration_seconds) : null,
    fade_in_seconds: row.fade_in_seconds != null ? Number(row.fade_in_seconds) : null,
    fade_out_seconds: row.fade_out_seconds != null ? Number(row.fade_out_seconds) : null,
  };
}

function normalizeImportedVibe(raw: Record<string, unknown>): Vibe {
  const soundsRaw = raw.sounds;
  const sounds = Array.isArray(soundsRaw)
    ? soundsRaw.map((x) => normalizeImportedSound(asRecord(x) ?? {}))
    : undefined;

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    thumbnail_url: raw.thumbnail_url != null ? String(raw.thumbnail_url) : null,
    card_image_url: raw.card_image_url != null ? String(raw.card_image_url) : null,
    player_background_url:
      raw.player_background_url != null ? String(raw.player_background_url) : null,
    artwork_url: raw.artwork_url != null ? String(raw.artwork_url) : null,
    is_active: Boolean(raw.is_active ?? true),
    sounds_count:
      raw.sounds_count != null
        ? Number(raw.sounds_count)
        : (sounds?.length ?? 0),
    created_at: raw.created_at != null ? String(raw.created_at) : '',
    updated_at: raw.updated_at != null ? String(raw.updated_at) : '',
    sounds,
  };
}

async function listPresetVibes(): Promise<PresetVibe[]> {
  const res = await fetch(`${API_BASE_URL}/api/preset-vibes`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: unknown[] }>(res);
  const rows = Array.isArray(body.data) ? body.data : [];

  return rows.map((x) => normalizePresetVibe(asRecord(x) ?? {}));
}

async function getPresetVibe(id: number): Promise<PresetVibe> {
  const res = await fetch(`${API_BASE_URL}/api/preset-vibes/${id}`, {
    headers: await authHeaders(),
  });
  const body = await handleResponse<{ data: unknown }>(res);

  return normalizePresetVibe(asRecord(body.data) ?? {});
}

/** POST import — returns new user-owned vibe (`VibeResource`, may include embedded `sounds`). */
async function importPresetVibe(id: number): Promise<Vibe> {
  const res = await fetch(`${API_BASE_URL}/api/preset-vibes/${id}/import`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  const body = await handleResponse<{ data: unknown }>(res);

  return normalizeImportedVibe(asRecord(body.data) ?? {});
}

export const presetVibeService = {
  listPresetVibes,
  getPresetVibe,
  importPresetVibe,
};
