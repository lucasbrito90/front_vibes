/**
 * Persists vibe sound files under Directory.Data for guaranteed offline playback.
 * ExoPlayer's SimpleCache (see RemoteAudioAsset) only buffers progressively — preload/prepare
 * does not download the entire file. This module performs a full HTTP fetch + Filesystem write.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

import type { VibeExecutionLayer } from '@/services/player-engine.service';

const MANIFEST_KEY = 'ixora_offline_audio_manifest_v1';
const LOG = '[AudioCache]';

export interface OfflineManifestEntry {
  relativePath: string;
  remoteUrl: string;
  savedAt: number;
}

export function offlineAudioKey(vibeId: number, soundId: number): string {
  return `${vibeId}:${soundId}`;
}

async function readManifest(): Promise<Record<string, OfflineManifestEntry>> {
  try {
    const { value } = await Preferences.get({ key: MANIFEST_KEY });
    if (!value) return {};
    const parsed = JSON.parse(value) as Record<string, OfflineManifestEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Record<string, OfflineManifestEntry>): Promise<void> {
  await Preferences.set({ key: MANIFEST_KEY, value: JSON.stringify(manifest) });
}

export function guessAudioExtension(remoteUrl: string, contentType: string | null): string {
  const ct = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (ct.includes('mpeg') || ct === 'audio/mp3') return '.mp3';
  if (ct.includes('ogg')) return '.ogg';
  if (ct.includes('wav')) return '.wav';
  if (ct.includes('aac')) return '.aac';
  if (ct.includes('mp4') || ct.includes('m4a')) return '.m4a';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('flac')) return '.flac';

  try {
    const u    = new URL(remoteUrl);
    const base = u.pathname.split('/').pop() ?? '';
    const m    = base.match(/\.([a-z0-9]{2,6})$/i);
    if (m) return `.${m[1].toLowerCase()}`;
  } catch {
    /* ignore */
  }

  return '.audio';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = (): void => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(new Error('FileReader result was not a string'));
        return;
      }
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = (): void => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Full-file download into app storage (Directory.Data). Updates manifest.
 */
export async function downloadLayerForOffline(vibeId: number, layer: VibeExecutionLayer): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Offline download is only supported on native builds');
  }

  const remoteUrl = layer.fileUrl.trim();
  console.log(`${LOG} download — start`, { vibeId, soundId: layer.soundId });

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob        = await response.blob();
  const ext         = guessAudioExtension(remoteUrl, response.headers.get('content-type'));
  const relativePath = `offline_audio/vibe_${vibeId}/sound_${layer.soundId}${ext}`;

  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({
    path:       relativePath,
    directory:  Directory.Data,
    data:       base64,
    recursive:  true,
  });

  const manifest                       = await readManifest();
  manifest[offlineAudioKey(vibeId, layer.soundId)] = {
    relativePath,
    remoteUrl,
    savedAt: Date.now(),
  };
  await writeManifest(manifest);

  console.log(`${LOG} download — saved`, { vibeId, soundId: layer.soundId, relativePath });
}

/**
 * If a manifest entry exists for this vibe+sound, matches the current remote URL,
 * and the file is on disk, returns a URI NativeAudio can load (file://…) via isUrl:true.
 */
export async function getOfflinePlaybackUriIfValid(
  vibeId: number,
  soundId: number,
  currentRemoteUrl: string,
): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || vibeId <= 0) return null;

  const manifest = await readManifest();
  const entry    = manifest[offlineAudioKey(vibeId, soundId)];
  const trimmed  = currentRemoteUrl.trim();

  if (!entry || entry.remoteUrl !== trimmed) return null;

  try {
    await Filesystem.stat({
      path:      entry.relativePath,
      directory: Directory.Data,
    });
  } catch {
    console.warn(`${LOG} playback resolve — missing file for manifest entry`, {
      vibeId,
      soundId,
      relativePath: entry.relativePath,
    });
    return null;
  }

  const { uri } = await Filesystem.getUri({
    directory: Directory.Data,
    path:      entry.relativePath,
  });

  console.log(`${LOG} playback resolve — using offline file`, { vibeId, soundId });
  return uri;
}
