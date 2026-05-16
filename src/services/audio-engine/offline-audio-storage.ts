/**
 * Persists vibe sound files under Directory.Data for guaranteed offline playback.
 * ExoPlayer's SimpleCache (see RemoteAudioAsset) only buffers progressively — preload/prepare
 * does not download the entire file.
 *
 * Downloads use CapacitorHttp (native stack), not WebView fetch(), so Firebase Storage
 * CORS (Origin https://localhost) does not apply.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { HttpHeaders } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

import type { VibeExecutionLayer } from '@/services/player-engine.service';

const MANIFEST_KEY = 'ixora_offline_audio_manifest_v1';
const LOG = '[AudioCache]';

/** Timeouts for large ambient files over HTTPS */
const CONNECT_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS    = 180_000;

export interface OfflineManifestEntry {
  relativePath: string;
  remoteUrl: string;
  savedAt: number;
}

export function offlineAudioKey(vibeId: number, soundId: number): string {
  return `${vibeId}:${soundId}`;
}

function getHeader(headers: HttpHeaders, name: string): string | null {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers ?? {})) {
    if (key.toLowerCase() === target) {
      const v = headers[key];
      return typeof v === 'string' ? v : null;
    }
  }
  return null;
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

/**
 * Native GET → base64 body suitable for Filesystem.writeFile without `encoding`.
 * On Android/iOS, responseType `blob` / `arraybuffer` maps to base64 string (see Capacitor HttpRequestHandler).
 */
async function downloadBinaryViaNativeHttp(remoteUrl: string): Promise<{ base64: string; contentType: string | null }> {
  const urlPreview = remoteUrl.length > 96 ? `${remoteUrl.slice(0, 96)}…` : remoteUrl;
  console.log(`${LOG} native download started`, { url: urlPreview });

  let status: number;
  let data: unknown;
  let headers: HttpHeaders;

  try {
    const response = await CapacitorHttp.request({
      url:            remoteUrl,
      method:         'GET',
      responseType:   'blob',
      connectTimeout: CONNECT_TIMEOUT_MS,
      readTimeout:    READ_TIMEOUT_MS,
    });
    status   = response.status;
    data     = response.data;
    headers  = response.headers;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG} native download failed`, { reason: 'native_exception', error: msg });
    throw new Error(msg);
  }

  if (status < 200 || status >= 300) {
    const bodyPreview = typeof data === 'string' ? data.slice(0, 160) : '';
    console.warn(`${LOG} native download failed`, {
      reason: 'http_error_status',
      status,
      bodyPreview: bodyPreview || undefined,
    });
    throw new Error(`HTTP ${status}`);
  }

  if (typeof data !== 'string' || data.length === 0) {
    console.warn(`${LOG} native download failed`, {
      reason: 'invalid_body',
      bodyType: typeof data,
    });
    throw new Error('Invalid or empty download body');
  }

  const contentType = getHeader(headers, 'Content-Type');
  console.log(`${LOG} native download success`, { status, contentType });

  return { base64: data, contentType };
}

/**
 * Full-file download into app storage (Directory.Data). Updates manifest.
 */
export async function downloadLayerForOffline(vibeId: number, layer: VibeExecutionLayer): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Offline download is only supported on native builds');
  }

  const remoteUrl = layer.fileUrl.trim();

  const { base64, contentType } = await downloadBinaryViaNativeHttp(remoteUrl);

  const ext          = guessAudioExtension(remoteUrl, contentType);
  const relativePath = `offline_audio/vibe_${vibeId}/sound_${layer.soundId}${ext}`;

  console.log(`${LOG} file saved — writing`, { vibeId, soundId: layer.soundId, relativePath });

  await Filesystem.writeFile({
    path:       relativePath,
    directory:  Directory.Data,
    data:       base64,
    recursive:  true,
  });

  const manifest = await readManifest();
  manifest[offlineAudioKey(vibeId, layer.soundId)] = {
    relativePath,
    remoteUrl,
    savedAt: Date.now(),
  };
  await writeManifest(manifest);

  console.log(`${LOG} manifest updated`, { vibeId, soundId: layer.soundId, relativePath });
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
    console.warn(`${LOG} local URI resolved — missing file`, {
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

  console.log(`${LOG} local URI resolved`, { vibeId, soundId, uri: uri.slice(0, 64) });
  return uri;
}
