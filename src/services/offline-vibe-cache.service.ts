/**
 * Persists minimal vibe + sound configuration so VibePlayerPage can rebuild
 * the execution plan when the API is unreachable (same session as a successful
 * “Download for offline”, or after cold start with cached Preferences).
 *
 * This is separate from `ixora_offline_audio_manifest_v1` (audio bytes on disk).
 */

import { Preferences } from '@capacitor/preferences';

import type { Vibe } from '@/services/vibe.service';
import type { VibeSound } from '@/services/vibe-sound.service';

const MANIFEST_KEY = 'offline_vibe_manifest_v1';
const LOG = '[OfflineVibe]';

/** Stored subset of `Vibe` — enough for player UI + store.playVibe metadata. */
export interface OfflineVibeMeta {
  id: number;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  card_image_url: string | null;
  player_background_url: string | null;
  artwork_url: string | null;
  is_active: boolean;
  sounds_count?: number;
}

export interface OfflineVibeSnapshot {
  vibeId: number;
  downloadedAt: number;
  vibe: OfflineVibeMeta;
  /** Same shape as GET /api/vibes/:id/sounds — used to rebuild executionPlan via buildPlan(). */
  vibeSounds: VibeSound[];
}

interface OfflineVibeManifestFile {
  version: 1;
  vibes: Record<string, OfflineVibeSnapshot>;
}

function emptyManifest(): OfflineVibeManifestFile {
  return { version: 1, vibes: {} };
}

async function readManifest(): Promise<OfflineVibeManifestFile> {
  try {
    const { value } = await Preferences.get({ key: MANIFEST_KEY });
    if (!value) return emptyManifest();
    const parsed = JSON.parse(value) as OfflineVibeManifestFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.vibes !== 'object' || !parsed.vibes) {
      return emptyManifest();
    }
    return parsed;
  } catch {
    return emptyManifest();
  }
}

async function writeManifest(manifest: OfflineVibeManifestFile): Promise<void> {
  await Preferences.set({ key: MANIFEST_KEY, value: JSON.stringify(manifest) });
}

export function vibeToOfflineMeta(vibe: Vibe): OfflineVibeMeta {
  return {
    id:                    vibe.id,
    name:                  vibe.name,
    description:           vibe.description,
    thumbnail_url:         vibe.thumbnail_url,
    card_image_url:        vibe.card_image_url,
    player_background_url: vibe.player_background_url,
    artwork_url:           vibe.artwork_url,
    is_active:             vibe.is_active,
    sounds_count:          vibe.sounds_count,
  };
}

/** Builds a full `Vibe` for `selectedVibe` / UI — timestamps are placeholders offline. */
export function offlineMetaToVibe(meta: OfflineVibeMeta): Vibe {
  const now = new Date().toISOString();
  return {
    ...meta,
    created_at: now,
    updated_at: now,
  };
}

export async function saveOfflineVibeSnapshot(
  vibeId: number,
  vibe: Vibe,
  vibeSounds: VibeSound[],
): Promise<void> {
  const manifest = await readManifest();
  const snapshot: OfflineVibeSnapshot = {
    vibeId,
    downloadedAt: Date.now(),
    vibe:         vibeToOfflineMeta(vibe),
    vibeSounds:   vibeSounds.map((s) => ({ ...s })),
  };
  manifest.vibes[String(vibeId)] = snapshot;
  await writeManifest(manifest);
  console.log(`${LOG} snapshot saved`, { vibeId, layers: vibeSounds.length });
}

export async function getOfflineVibeSnapshot(vibeId: number): Promise<OfflineVibeSnapshot | null> {
  const manifest = await readManifest();
  const snap = manifest.vibes[String(vibeId)];
  if (!snap || snap.vibeId !== vibeId) return null;
  return snap;
}

export async function hasOfflineVibeSnapshot(vibeId: number): Promise<boolean> {
  const snap = await getOfflineVibeSnapshot(vibeId);
  return !!snap && snap.vibeSounds.length > 0;
}

export async function removeOfflineVibeSnapshot(vibeId: number): Promise<void> {
  const manifest = await readManifest();
  delete manifest.vibes[String(vibeId)];
  await writeManifest(manifest);
  console.log(`${LOG} snapshot removed`, { vibeId });
}
