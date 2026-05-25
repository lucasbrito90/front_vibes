/**
 * Facade for “download for offline” bookkeeping: vibe metadata snapshots + full-file audio manifest.
 * Does not touch AudioEngine playback APIs.
 */

import { Capacitor } from '@capacitor/core';

import { removeAllOfflineAudioForVibe } from '@/services/audio-engine/offline-audio-storage';
import {
  getAllOfflineVibeSnapshots,
  hasOfflineVibeSnapshot,
  removeOfflineVibeSnapshot,
  type OfflineVibeSnapshot,
} from '@/services/offline-vibe-cache.service';

/** Vibe IDs that have a persisted offline snapshot (saved only after a successful full download). */
export async function getDownloadedVibeIds(): Promise<number[]> {
  const snaps = await getAllOfflineVibeSnapshots();
  return snaps.filter((s) => s.vibeSounds.length > 0).map((s) => s.vibeId);
}

export async function isVibeDownloaded(vibeId: number): Promise<boolean> {
  if (vibeId <= 0) return false;
  return hasOfflineVibeSnapshot(vibeId);
}

export async function getOfflineVibeSnapshots(): Promise<OfflineVibeSnapshot[]> {
  const snaps = await getAllOfflineVibeSnapshots();
  return snaps.filter((s) => s.vibeSounds.length > 0).sort((a, b) => b.downloadedAt - a.downloadedAt);
}

/**
 * Removes full-file audio from app storage (native), clears audio manifest entries for the vibe,
 * and deletes the offline metadata snapshot so the vibe no longer hydrates offline.
 */
export async function removeDownloadedVibe(vibeId: number): Promise<void> {
  if (vibeId <= 0) return;
  if (Capacitor.isNativePlatform()) await removeAllOfflineAudioForVibe(vibeId);
  await removeOfflineVibeSnapshot(vibeId);
}
