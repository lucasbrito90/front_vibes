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
 * ## Cache architecture (@capgo/native-audio 8.4.2 — Android)
 * ExoPlayer uses SimpleCache (100 MiB LRU) backed by getCacheDir()/media.
 * unload() releases only the ExoPlayer instance — cached bytes remain on disk.
 * This means preload+unload is a safe cache-warming pattern: the asset is
 * buffered through CacheDataSource and stays on disk for future playback.
 * See docs/audio-cache.md for full details.
 */

import { NativeAudio } from '@capgo/native-audio';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { VibeExecutionLayer } from '@/services/player-engine.service';
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
    });
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
        ? 'Android internal cache: getCacheDir()/media (ExoPlayer SimpleCache LRU)'
        : 'Not applicable — web platform uses browser HTTP cache',
      notes: [
        'Cache is automatic for non-HLS HTTPS URLs (e.g. Firebase Storage MP3/OGG).',
        'HLS (.m3u8) URLs use StreamAudioAsset which bypasses SimpleCache.',
        'unload() does NOT evict cached bytes — preload+unload safely warms cache.',
        'clearAudioCache() releases SimpleCache and deletes the cache/media folder.',
        'Rotating signed Firebase Storage URLs may not deduplicate cache entries.',
        'OS may evict cache when device storage is low.',
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

    return result;
  }

  /**
   * Warms cache for a single layer using a temporary cache-only assetId.
   * The assetId uses the "cache-" prefix so it never conflicts with active
   * playback layers ("vibe-layer-{soundId}") even if the same sound is
   * currently playing.
   */
  private async _cacheOneLayer(vibeId: number, layer: VibeExecutionLayer): Promise<LayerCacheOutcome> {
    const base: Omit<LayerCacheOutcome, 'status' | 'error'> = {
      soundId:   layer.soundId,
      soundName: layer.soundName,
    };

    // Skip local file:// assets (no remote caching applies)
    const url = layer.fileUrl?.trim() ?? '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log(`${LOG_CACHE} skip (non-remote URL)`, { soundId: layer.soundId });
      return { ...base, status: 'skipped' };
    }

    // Use a separate "cache-only" assetId so we don't collide with an active layer
    const cacheAssetId = `cache-vibe-${vibeId}-sound-${layer.soundId}`;

    // Clean up any orphaned cache asset from a previous interrupted warm
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preloaded = await NativeAudio.isPreloaded({ assetId: cacheAssetId } as any);
      if (preloaded?.found) {
        await NativeAudio.stop({ assetId: cacheAssetId }).catch(() => null);
        await NativeAudio.unload({ assetId: cacheAssetId }).catch(() => null);
      }
    } catch { /* ignore */ }

    console.log(`${LOG_CACHE} preload (cache-only) — start`, {
      soundId: layer.soundId,
      cacheAssetId,
    });

    try {
      await NativeAudio.preload({
        assetId:   cacheAssetId,
        assetPath: url,
        isUrl:     true,
        volume:    0.1,
        audioChannelNum: 1,
      } as Parameters<typeof NativeAudio.preload>[0]);

      // Immediately unload the ExoPlayer instance.
      // Cached bytes remain in SimpleCache — unload() does not evict them.
      await NativeAudio.stop({ assetId: cacheAssetId }).catch(() => null);
      await NativeAudio.unload({ assetId: cacheAssetId }).catch(() => null);

      console.log(`${LOG_CACHE} cache-only asset unloaded (bytes remain in disk cache)`, {
        soundId: layer.soundId,
        cacheAssetId,
      });

      return { ...base, status: 'cached' };
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG_CACHE} preload (cache-only) — failed`, {
        soundId: layer.soundId,
        cacheAssetId,
        error: errorStr,
      });
      return { ...base, status: 'failed', error: errorStr };
    }
  }
}

/** Singleton — the rest of the app imports this instance. */
export const nativeAudioEngine = new NativeAudioEngine();
