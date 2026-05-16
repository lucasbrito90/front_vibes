/**
 * NativeAudioEngine — AudioEngine implementation backed by @capgo/native-audio.
 *
 * This is a thin adapter layer that translates the AudioEngine interface into
 * @capgo/native-audio plugin calls. It owns:
 *  - assetId generation (stable, layer-scoped)
 *  - the `_activeLayers` set (native-side lifecycle tracking)
 *  - the global 'complete' listener for once/interval completion events
 *  - the idempotent pre-preload cleanup helper
 *
 * ## What this does NOT own
 * Timing logic (durationSeconds, startOffset, interval gaps), HTML fallback,
 * session-pause state, and the public playLayer/stopLayer API surface remain
 * in audio-player.service.ts. A full migration is a future task documented in
 * docs/issues/audio-engine-fade-limitations.md.
 *
 * ## Migration status
 * Incremental Phase 1: helpers extracted here, main service imports them.
 * Future phases will migrate the full start/pause/stop flow to this class.
 */

import { NativeAudio } from '@capgo/native-audio';
import type { PluginListenerHandle } from '@capacitor/core';
import type { VibeExecutionLayer } from '@/services/player-engine.service';
import type { AudioEngine, AudioEngineConfig } from './types';

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
}

/** Singleton — the rest of the app imports this instance. */
export const nativeAudioEngine = new NativeAudioEngine();
