/**
 * Facade for “download for offline” bookkeeping: vibe metadata snapshots + full-file audio manifest.
 * Does not touch AudioEngine playback APIs.
 */

import { Capacitor } from '@capacitor/core';

import {
  cleanupOrphanedOfflineAudio,
  getOfflineManifestRemoteUrlsForVibe,
  hasOrphanOfflineAudioManifest,
  inspectOfflineLayer,
  removeAllOfflineAudioForVibe,
} from '@/services/audio-engine/offline-audio-storage';
import {
  getOfflineVibeSnapshot,
  getAllOfflineVibeSnapshots,
  hasOfflineVibeSnapshot,
  removeOfflineVibeSnapshot,
  type OfflineVibeSnapshot,
} from '@/services/offline-vibe-cache.service';
import {
  compareOfflineSnapshotSounds,
  comparePlanUrlsToManifest,
  deriveOfflineHealthStatus,
  offlineHealthLabel,
  offlineHealthNeedsUpdate,
  type OfflineVibeHealthStatus,
} from '@/services/offline-playback-status';
import type { VibeSound } from '@/services/vibe-sound.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

export type { OfflineVibeHealthStatus };
export { offlineHealthLabel, offlineHealthNeedsUpdate };

export interface OfflineVibeHealthReport {
  status: OfflineVibeHealthStatus;
  label: string;
  needsUpdate: boolean;
  snapshotDiffCount: number;
  staleUrlLayerCount: number;
  missingFileLayerCount: number;
  localLayerCount: number;
}

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

/**
 * Cleans orphaned audio manifest rows (partial failed download) and returns whether cleanup ran.
 */
export async function repairBrokenOfflineState(vibeId: number): Promise<boolean> {
  if (vibeId <= 0) return false;
  const hasSnapshot = await hasOfflineVibeSnapshot(vibeId);
  if (hasSnapshot) return false;
  return cleanupOrphanedOfflineAudio(vibeId);
}

/**
 * Assess offline readiness for the current vibe: snapshot sync, URL match, and on-disk files.
 */
export async function assessOfflineVibeHealth(
  vibeId: number,
  currentSounds: VibeSound[],
  executionPlan: VibeExecutionLayer[],
): Promise<OfflineVibeHealthReport> {
  if (vibeId <= 0) {
    return {
      status: 'not_downloaded',
      label: offlineHealthLabel('not_downloaded'),
      needsUpdate: false,
      snapshotDiffCount: 0,
      staleUrlLayerCount: 0,
      missingFileLayerCount: 0,
      localLayerCount: 0,
    };
  }

  const snapshot = await getOfflineVibeSnapshot(vibeId);
  const hasSnapshot = !!snapshot && snapshot.vibeSounds.length > 0;
  const hasOrphanAudio = await hasOrphanOfflineAudioManifest(vibeId);

  const snapshotCompare = hasSnapshot
    ? compareOfflineSnapshotSounds(snapshot!.vibeSounds, currentSounds)
    : { inSync: true, diffs: [] };

  const manifestUrls = Capacitor.isNativePlatform()
    ? await getOfflineManifestRemoteUrlsForVibe(vibeId)
    : {};

  const urlChecks = comparePlanUrlsToManifest(
    executionPlan,
    Object.fromEntries(
      Object.entries(manifestUrls).map(([id, url]) => [Number(id), url]),
    ),
  );

  let staleUrlLayerCount = 0;
  let missingFileLayerCount = 0;
  let localLayerCount = 0;

  if (Capacitor.isNativePlatform() && executionPlan.length > 0) {
    const inspections = await Promise.all(
      executionPlan.map((layer) =>
        inspectOfflineLayer(vibeId, layer.soundId, layer.fileUrl),
      ),
    );
    for (const row of inspections) {
      if (row.reason === 'local') localLayerCount++;
      if (row.reason === 'stale_url') staleUrlLayerCount++;
      if (row.reason === 'missing_file') missingFileLayerCount++;
    }
  }

  const allManifestUrlsMatch = urlChecks.every(
    (c) => c.manifestUrl === null || c.matches,
  );

  const status = deriveOfflineHealthStatus({
    hasSnapshot,
    hasOrphanAudioManifest: hasOrphanAudio,
    snapshotInSync: snapshotCompare.inSync,
    allManifestUrlsMatch: allManifestUrlsMatch && staleUrlLayerCount === 0,
    allLocalFilesPresent: missingFileLayerCount === 0,
  });

  return {
    status,
    label: offlineHealthLabel(status),
    needsUpdate: offlineHealthNeedsUpdate(status),
    snapshotDiffCount: snapshotCompare.diffs.length,
    staleUrlLayerCount,
    missingFileLayerCount,
    localLayerCount,
  };
}
