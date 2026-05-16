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
 * ## Current state
 * The interface is intentionally minimal — it covers only the operations that
 * audio-player.service.ts performs today. See docs/issues/audio-engine-fade-limitations.md
 * for the roadmap.
 *
 * ## Future additions (when a proper engine is built)
 *   setVolume(soundId, volume): Promise<void>
 *   fadeIn(soundId, targetVolume, durationSeconds): Promise<void>
 *   fadeOut(soundId, durationSeconds): Promise<void>
 *   setPlaybackRate(soundId, rate): Promise<void>
 */

import type { VibeExecutionLayer } from '@/services/player-engine.service';

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
}
