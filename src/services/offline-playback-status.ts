/**
 * Pure offline playback health helpers — snapshot vs API diff and manifest URL checks.
 * No I/O; async file/manifest inspection lives in offline-audio-storage + offline-downloads.
 */

import type { VibeSound } from '@/services/vibe-sound.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

export type OfflineVibeHealthStatus =
  | 'not_downloaded'
  | 'ready'
  | 'stale_snapshot'
  | 'stale_urls'
  | 'missing_files'
  | 'partial_audio';

export type OfflineLayerResolutionReason =
  | 'local'
  | 'no_manifest_entry'
  | 'stale_url'
  | 'missing_file';

export interface OfflineSnapshotLayerDiff {
  soundId: number;
  name: string;
  kind: 'added' | 'removed' | 'url_changed' | 'config_changed';
}

export interface OfflineSnapshotCompareResult {
  inSync: boolean;
  diffs: OfflineSnapshotLayerDiff[];
}

/** Pivot fields that affect playback plan shape (excluding fades — stored but ignored at runtime). */
const SNAPSHOT_CONFIG_KEYS = [
  'volume',
  'sort_order',
  'play_mode',
  'repeat_interval_seconds',
  'start_offset_seconds',
  'play_duration_seconds',
] as const satisfies readonly (keyof VibeSound)[];

function snapshotConfigSignature(sound: VibeSound): string {
  return SNAPSHOT_CONFIG_KEYS.map((k) => `${k}:${JSON.stringify(sound[k] ?? null)}`).join('|');
}

/**
 * Compare saved offline snapshot sounds with the current API-loaded list.
 * Used to detect stale metadata before playback or re-download.
 */
export function compareOfflineSnapshotSounds(
  snapshotSounds: VibeSound[],
  currentSounds: VibeSound[],
): OfflineSnapshotCompareResult {
  const snapshotById = new Map(snapshotSounds.map((s) => [s.id, s]));
  const currentById = new Map(currentSounds.map((s) => [s.id, s]));
  const diffs: OfflineSnapshotLayerDiff[] = [];

  for (const snap of snapshotSounds) {
    const current = currentById.get(snap.id);
    if (!current) {
      diffs.push({ soundId: snap.id, name: snap.name, kind: 'removed' });
      continue;
    }
    if (snap.file_url.trim() !== current.file_url.trim()) {
      diffs.push({ soundId: snap.id, name: current.name, kind: 'url_changed' });
      continue;
    }
    if (snapshotConfigSignature(snap) !== snapshotConfigSignature(current)) {
      diffs.push({ soundId: snap.id, name: current.name, kind: 'config_changed' });
    }
  }

  for (const current of currentSounds) {
    if (!snapshotById.has(current.id)) {
      diffs.push({ soundId: current.id, name: current.name, kind: 'added' });
    }
  }

  return { inSync: diffs.length === 0, diffs };
}

export interface OfflineManifestUrlCheck {
  soundId: number;
  soundName: string;
  planUrl: string;
  manifestUrl: string | null;
  matches: boolean;
}

/**
 * Compare execution-plan URLs against stored manifest remoteUrl values (exact trim match rule).
 */
export function comparePlanUrlsToManifest(
  layers: VibeExecutionLayer[],
  manifestRemoteUrlBySoundId: Record<number, string | null>,
): OfflineManifestUrlCheck[] {
  return layers.map((layer) => {
    const planUrl = layer.fileUrl.trim();
    const manifestUrl = manifestRemoteUrlBySoundId[layer.soundId] ?? null;
    const matches = manifestUrl !== null && manifestUrl === planUrl;
    return {
      soundId: layer.soundId,
      soundName: layer.soundName,
      planUrl,
      manifestUrl,
      matches,
    };
  });
}

export function deriveOfflineHealthStatus(input: {
  hasSnapshot: boolean;
  hasOrphanAudioManifest: boolean;
  snapshotInSync: boolean;
  allManifestUrlsMatch: boolean;
  allLocalFilesPresent: boolean;
}): OfflineVibeHealthStatus {
  if (input.hasOrphanAudioManifest && !input.hasSnapshot) return 'partial_audio';
  if (!input.hasSnapshot) return 'not_downloaded';
  if (!input.snapshotInSync) return 'stale_snapshot';
  if (!input.allManifestUrlsMatch) return 'stale_urls';
  if (!input.allLocalFilesPresent) return 'missing_files';
  return 'ready';
}

export function offlineHealthNeedsUpdate(status: OfflineVibeHealthStatus): boolean {
  return status === 'stale_snapshot'
    || status === 'stale_urls'
    || status === 'missing_files'
    || status === 'partial_audio';
}

export function offlineHealthLabel(status: OfflineVibeHealthStatus): string {
  switch (status) {
    case 'not_downloaded':
      return 'Not downloaded';
    case 'ready':
      return 'Ready for offline';
    case 'stale_snapshot':
      return 'Offline copy out of date';
    case 'stale_urls':
      return 'Audio URLs changed — update needed';
    case 'missing_files':
      return 'Offline files missing';
    case 'partial_audio':
      return 'Incomplete download';
    default:
      return status;
  }
}

export function layerResolutionLabel(reason: OfflineLayerResolutionReason): string {
  switch (reason) {
    case 'local':
      return 'local file://';
    case 'no_manifest_entry':
      return 'HTTPS fallback (no manifest)';
    case 'stale_url':
      return 'HTTPS fallback (URL mismatch)';
    case 'missing_file':
      return 'HTTPS fallback (file missing)';
    default:
      return reason;
  }
}
