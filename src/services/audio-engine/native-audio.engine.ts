/**
 * NativeAudioEngine — AudioEngine implementation backed by @capgo/native-audio.
 *
 * This is a thin adapter layer that translates the AudioEngine interface into
 * @capgo/native-audio plugin calls. It owns:
 *  - assetId generation (stable, layer-scoped)
 *  - the `_activeLayers` set (native-side lifecycle tracking)
 *  - the global 'complete' listener for once/interval completion events
 *  - the idempotent pre-preload cleanup helper
 *  - cache management (clearAudioCache, cacheVibeAudio)
 *
 * ## What this does NOT own
 * Timing logic (durationSeconds, startOffset, interval gaps), HTML fallback,
 * session-pause state, and the public playLayer/stopLayer API surface remain
 * in audio-player.service.ts. A full migration is a future task documented in
 * docs/issues/audio-engine-fade-limitations.md.
 *
 * ## Streaming cache architecture (@capgo/native-audio 8.4.2 — Android)
 * ExoPlayer uses SimpleCache (100 MiB LRU) under getCacheDir()/media during http(s)
 * playback — progressive buffering only; it is not a guaranteed full-file download.
 * Guaranteed offline copies live in Directory.Data via offline-audio-storage.ts.
 * See docs/audio-cache.md for full details.
 */

import { NativeAudio } from '@capgo/native-audio';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { VibeExecutionLayer } from '@/services/player-engine.service';
import { downloadLayerForOffline, getOfflinePlaybackUriIfValid } from './offline-audio-storage';
import type {
  AudioEngine,
  AudioEngineConfig,
  AudioCacheInfo,
  CacheVibeResult,
  LayerCacheOutcome,
} from './types';

const LOG_CACHE = '[AudioCache]';

/** Max cache size mirroring RemoteAudioAsset.MAX_CACHE_SIZE (100 MiB). */
const NATIVE_CACHE_MAX_BYTES = 100 * 1024 * 1024;

export class NativeAudioEngine implements AudioEngine {
  private readonly activeLayers = new Set<string>();
  private completeHandle: PluginListenerHandle | null = null;
  private completeCallback: ((soundId: number) => void) | null = null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Stable assetId for a given soundId. */
  assetId(soundId: number): string {
    return `vibe-layer-${soundId}`;
  }

  /** @inheritdoc */
  isLayerActive(soundId: number): boolean {
    return this.activeLayers.has(this.assetId(soundId));
  }

  /** @inheritdoc */
  onPlaybackComplete(callback: (soundId: number) => void): void {
    this.completeCallback = callback;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async configure(config?: AudioEngineConfig): Promise<void> {
    await NativeAudio.configure({
      fade:  false,
      focus: true,
      ...(config?.debug ? { debug: true } : {}),
      // Plugin typings omit several runtime-supported keys (cf. audio-player.service.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  /** @inheritdoc */
  async resolvePlaybackAssetUrl(layer: VibeExecutionLayer, vibeId: number): Promise<string> {
    try {
      const uri = await getOfflinePlaybackUriIfValid(vibeId, layer.soundId, layer.fileUrl);
      return uri ?? layer.fileUrl;
    } catch (err) {
      console.warn(`${LOG_CACHE} playback resolve — fallback remote`, err);
      return layer.fileUrl;
    }
  }

  /**
   * Ensures the global 'complete' listener is registered.
   * Lazy — called before the first once/interval preload.
   */
  async ensureCompleteListener(): Promise<void> {
    if (this.completeHandle) return;
    try {
      this.completeHandle = await NativeAudio.addListener(
        'complete',
        ({ assetId }: { assetId: string }) => {
          if (!this.completeCallback) return;
          const match = assetId.match(/^vibe-layer-(\d+)$/);
          if (match) this.completeCallback(Number(match[1]));
        },
      );
    } catch (err) {
      console.warn('[NativeAudioEngine] failed to register complete listener', err);
    }
  }

  /**
   * Cleans up any stale native asset before preloading.
   * Guards against JS/native state desync (hot-reload, failed previous unload).
   */
  async ensureAssetClean(soundId: number): Promise<void> {
    const id = this.assetId(soundId);
    let foundInNative = false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await NativeAudio.isPreloaded({ assetId: id } as any);
      foundInNative = result?.found ?? false;
    } catch {
      foundInNative = this.activeLayers.has(id);
    }

    if (!foundInNative && !this.activeLayers.has(id)) return;

    if (foundInNative) {
      try { await NativeAudio.stop({ assetId: id }); } catch { /* already stopped */ }
      try { await NativeAudio.unload({ assetId: id }); } catch { /* already unloaded */ }
    }
    this.activeLayers.delete(id);
  }

  /** @inheritdoc */
  async preloadLayer(
    layer: VibeExecutionLayer,
    opts?: { isComplex?: boolean; notificationMetadata?: { title?: string; artist?: string; artworkUrl?: string } },
  ): Promise<void> {
    const id      = this.assetId(layer.soundId);
    const volume  = Math.max(0.1, Math.min(1, layer.volume / 100));

    await NativeAudio.preload({
      assetId:  id,
      assetPath: layer.fileUrl,
      isUrl:    true,
      volume,
      audioChannelNum: 1,
      ...(opts?.isComplex ? { isComplex: true } : {}),
      ...(opts?.notificationMetadata
        ? { notificationMetadata: opts.notificationMetadata }
        : {}),
    } as Parameters<typeof NativeAudio.preload>[0]);

    this.activeLayers.add(id);
  }

  /** @inheritdoc */
  async loopLayer(layer: VibeExecutionLayer): Promise<void> {
    await NativeAudio.loop({ assetId: this.assetId(layer.soundId) });
  }

  /** @inheritdoc */
  async playLayer(layer: VibeExecutionLayer): Promise<void> {
    await NativeAudio.play({ assetId: this.assetId(layer.soundId) });
  }

  /** @inheritdoc */
  async pauseLayer(soundId: number): Promise<void> {
    const id = this.assetId(soundId);
    if (!this.activeLayers.has(id)) return;
    await NativeAudio.pause({ assetId: id });
  }

  /** @inheritdoc */
  async resumeLayer(soundId: number): Promise<void> {
    const id = this.assetId(soundId);
    if (!this.activeLayers.has(id)) return;
    await NativeAudio.resume({ assetId: id });
  }

  /** @inheritdoc */
  async stopLayer(soundId: number): Promise<void> {
    const id = this.assetId(soundId);
    try { await NativeAudio.stop({ assetId: id }); } catch { /* already stopped */ }
    try { await NativeAudio.unload({ assetId: id }); } catch { /* already unloaded */ }
    this.activeLayers.delete(id);
  }

  /** @inheritdoc */
  async stopAll(): Promise<void> {
    const ids = [...this.activeLayers];
    await Promise.allSettled(ids.map((id) => this.stopLayer(Number(id.replace('vibe-layer-', '')))));
  }

  // ── Cache management ───────────────────────────────────────────────────────

  /** @inheritdoc */
  getCacheInfo(): AudioCacheInfo {
    const isNative = Capacitor.isNativePlatform();
    return {
      hasCacheSupport: isNative,
      maxSizeBytes:    isNative ? NATIVE_CACHE_MAX_BYTES : null,
      location:        isNative
        ? 'Streaming LRU: getCacheDir()/media · Offline files: Directory.Data/offline_audio/'
        : 'Not applicable — web platform uses browser HTTP cache',
      notes: [
        'ExoPlayer SimpleCache buffers progressively during HTTPS playback — not a full-file guarantee.',
        '“Download for offline” uses CapacitorHttp (native GET) + Directory.Data (Filesystem).',
        'clearAudioCache() only clears ExoPlayer cache/media — offline downloads are kept.',
        'HLS (.m3u8) URLs use StreamAudioAsset which bypasses SimpleCache.',
        'Rotating signed URLs (e.g. legacy Firebase Storage tokens) invalidate offline manifest entries when `layer.fileUrl` changes.',
        'OS may evict ExoPlayer cache when device storage is low.',
      ],
    };
  }

  /** @inheritdoc */
  async clearAudioCache(): Promise<void> {
    console.log(`${LOG_CACHE} clear — started`);
    try {
      await NativeAudio.clearCache();
      console.log(`${LOG_CACHE} clear — success`);
    } catch (err) {
      console.warn(`${LOG_CACHE} clear — failed`, err);
      throw err;
    }
  }

  /** @inheritdoc */
  async cacheVibeAudio(vibeId: number, layers: VibeExecutionLayer[]): Promise<CacheVibeResult> {
    console.log(`${LOG_CACHE} cacheVibeAudio — started`, {
      vibeId,
      layerCount: layers.length,
    });

    const result: CacheVibeResult = { succeeded: 0, skipped: 0, failed: 0, details: [] };

    for (const layer of layers) {
      const outcome = await this._cacheOneLayer(vibeId, layer);
      result.details.push(outcome);
      if (outcome.status === 'cached')  result.succeeded++;
      if (outcome.status === 'skipped') result.skipped++;
      if (outcome.status === 'failed')  result.failed++;
    }

    console.log(`${LOG_CACHE} cacheVibeAudio — done`, {
      vibeId,
      succeeded: result.succeeded,
      skipped:   result.skipped,
      failed:    result.failed,
    });

    if (result.failed > 0) {
      const failedDetail = result.details
        .filter((d) => d.status === 'failed')
        .map((d) => ({ soundId: d.soundId, name: d.soundName, error: d.error }));
      console.warn(`${LOG_CACHE} cache result — failed layers`, failedDetail);
    }

    return result;
  }

  /**
   * Full-file offline download for one layer (native only).
   */
  private async _cacheOneLayer(vibeId: number, layer: VibeExecutionLayer): Promise<LayerCacheOutcome> {
    const base: Omit<LayerCacheOutcome, 'status' | 'error'> = {
      soundId:   layer.soundId,
      soundName: layer.soundName,
    };

    const url = layer.fileUrl?.trim() ?? '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log(`${LOG_CACHE} skip (non-remote URL)`, { soundId: layer.soundId });
      return { ...base, status: 'skipped' };
    }

    if (!Capacitor.isNativePlatform()) {
      console.log(`${LOG_CACHE} skip (offline download requires native build)`, { soundId: layer.soundId });
      return { ...base, status: 'skipped' };
    }

    console.log(`${LOG_CACHE} download requested`, { vibeId, soundId: layer.soundId });

    try {
      await downloadLayerForOffline(vibeId, layer);
      console.log(`${LOG_CACHE} download — success`, { vibeId, soundId: layer.soundId });
      return { ...base, status: 'cached' };
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG_CACHE} download — failed`, {
        vibeId,
        soundId: layer.soundId,
        error: errorStr,
      });
      return { ...base, status: 'failed', error: errorStr };
    }
  }
}

/** Singleton — the rest of the app imports this instance. */
export const nativeAudioEngine = new NativeAudioEngine();
