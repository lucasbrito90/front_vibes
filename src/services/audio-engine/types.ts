/**
 * AudioEngine interface — abstracts the native audio library so the rest of
 * the app is not coupled to @capgo/native-audio.
 *
 * ## Motivation
 * @capgo/native-audio has proven difficult to extend reliably (fade support,
 * loopWithFadeIn, STATE_BUFFERING races). Introducing this interface allows
 * swapping the engine for a custom Capacitor plugin or any other library in
 * the future without touching player.store.ts or the UI layer.
 *
 * ## Streaming cache vs offline download (@capgo/native-audio 8.4.2 — Android)
 * - ExoPlayer SimpleCache (100 MB LRU) buffers progressively during playback — it
 *   does **not** guarantee the full file is on disk after preload/prepare.
 * - “Download for offline” writes the complete file to Directory.Data via fetch +
 *   `@capacitor/filesystem`; playback resolves to a `file://` URI when the manifest
 *   matches the current remote URL.
 * - clearAudioCache() only clears ExoPlayer's cache/media folder — not offline files.
 * See docs/audio-cache.md for full details.
 *
 * ## Future additions (when a proper engine is built)
 *   setVolume(soundId, volume): Promise<void>
 *   fadeIn(soundId, targetVolume, durationSeconds): Promise<void>
 *   fadeOut(soundId, durationSeconds): Promise<void>
 *   setPlaybackRate(soundId, rate): Promise<void>
 */

import type { VibeExecutionLayer } from '@/services/player-engine.service';

// ── Cache types ───────────────────────────────────────────────────────────────

export interface AudioCacheInfo {
  /** Whether the engine has a disk-cache mechanism. */
  hasCacheSupport: boolean;
  /**
   * Approximate max cache size in bytes (e.g. 104_857_600 for 100 MiB).
   * Null if the engine does not know its limit.
   */
  maxSizeBytes: number | null;
  /** Human-readable description of where the cache is stored. */
  location: string;
  /**
   * Notes or known limitations for this engine's cache implementation.
   * Empty array if none.
   */
  notes: string[];
}

export interface LayerCacheOutcome {
  soundId: number;
  soundName: string;
  status: 'cached' | 'skipped' | 'failed';
  /** Only present when status === 'failed' */
  error?: string;
}

export interface CacheVibeResult {
  /** Layers that were successfully warmed into cache */
  succeeded: number;
  /** Layers that were skipped (e.g. non-remote URLs, already playing) */
  skipped: number;
  /** Layers that failed to preload */
  failed: number;
  details: LayerCacheOutcome[];
}

export interface AudioEngineConfig {
  /** Enable native audio debug logging */
  debug?: boolean;
  /** Base URL for artwork images shown in lock-screen/notification */
  artworkUrl?: string;
  /** Vibe name shown in the notification */
  vibeName?: string;
}

export interface AudioEngine {
  /**
   * One-time setup. Must be called before any other method.
   * Idempotent — safe to call multiple times.
   */
  configure(config?: AudioEngineConfig): Promise<void>;

  /**
   * Resolve the asset URL used for preload/play on native: returns a `file://`
   * URI when a manifest-backed offline copy exists and matches `layer.fileUrl`,
   * otherwise the remote `layer.fileUrl`. Web always returns `layer.fileUrl`.
   */
  resolvePlaybackAssetUrl(layer: VibeExecutionLayer, vibeId: number): Promise<string>;

  /**
   * Preload the audio asset for a layer into memory.
   * Must be called before playLayer() / loopLayer().
   * Idempotent: cleans up any stale asset with the same id first.
   */
  preloadLayer(layer: VibeExecutionLayer): Promise<void>;

  /**
   * Start looping the layer's audio continuously.
   * Expects preloadLayer() to have been called first.
   */
  loopLayer(layer: VibeExecutionLayer): Promise<void>;

  /**
   * Play the layer's audio once (non-looping).
   * Expects preloadLayer() to have been called first.
   * Resolves as soon as playback is initiated (not when it ends).
   */
  playLayer(layer: VibeExecutionLayer): Promise<void>;

  /**
   * Pause a layer that is currently playing or looping.
   * Idempotent — no-op if the layer is not active.
   */
  pauseLayer(soundId: number): Promise<void>;

  /**
   * Resume a previously paused layer.
   * Idempotent — no-op if the layer is not paused.
   */
  resumeLayer(soundId: number): Promise<void>;

  /**
   * Stop and fully unload a layer's audio asset.
   * After this call the assetId is freed and the layer must be re-preloaded
   * before it can play again.
   * Idempotent — safe to call even if the layer was never loaded.
   */
  stopLayer(soundId: number): Promise<void>;

  /**
   * Stop and unload all active layers.
   */
  stopAll(): Promise<void>;

  /**
   * Returns true if an asset is currently registered in the native engine
   * (preloaded and not yet unloaded).
   */
  isLayerActive(soundId: number): boolean;

  /**
   * Register a callback that fires when a once-play layer finishes naturally.
   * The callback receives the soundId of the completed layer.
   */
  onPlaybackComplete(callback: (soundId: number) => void): void;

  // ── Cache management ───────────────────────────────────────────────────────

  /**
   * Returns static information about this engine's cache capabilities.
   * Does not query the filesystem — returns pre-known metadata synchronously.
   */
  getCacheInfo(): AudioCacheInfo;

  /**
   * Clear the audio disk cache.
   *
   * For @capgo/native-audio: releases the static SimpleCache and deletes
   * Context.getCacheDir()/media. The cache is recreated automatically on the
   * next preload call.
   *
   * Idempotent — safe to call when no audio is playing or cache is empty.
   * Should NOT be called while audio is actively playing (the SimpleCache
   * is shared across all active RemoteAudioAsset instances).
   */
  clearAudioCache(): Promise<void>;

  /**
   * Download each eligible remote layer to app storage (full file) without playback.
   *
   * Uses HTTP fetch + Filesystem (Directory.Data). Does not rely on ExoPlayer
   * preload as a “download complete” signal.
   *
   * @param vibeId - Namespace for on-disk paths and manifest keys
   * @param layers - Execution layers to download
   */
  cacheVibeAudio(vibeId: number, layers: VibeExecutionLayer[]): Promise<CacheVibeResult>;
}
