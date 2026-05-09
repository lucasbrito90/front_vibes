/**
 * native-audio-poc.service.ts
 *
 * Proof-of-concept wrapper around @capgo/native-audio.
 * Scope: ONE loop layer, remote HTTPS URL, volume, play/pause/resume/stop.
 *
 * ## Design decisions
 *
 * 1. loop() is used instead of play() + complete listener.
 *    The native Android MediaPlayer supports setLooping(true) which is what
 *    loop() maps to. It is simpler, has no gap between iterations, and keeps
 *    the native state machine clean for pause/resume.
 *
 * 2. Guards use _preloaded (not _playing).
 *    _playing tracking was causing pause/resume to be silently skipped
 *    whenever the JS module state diverged from the native state (e.g.
 *    live reload clearing module-level Sets, or an exception thrown by the
 *    Capacitor bridge after native audio had already started). _preloaded
 *    is more reliable: it only fails when preload() itself failed.
 *    Pause/resume let the native plugin handle "not currently playing"
 *    gracefully rather than skipping the call in JS.
 *
 * Intentionally NOT implemented here:
 *   - background audio / foreground service
 *   - lock screen controls / notifications
 *   - interval mode / once mode
 *   - fade in / fade out
 *   - multiple simultaneous layers
 *   - duration timers / start offsets
 *   - schedules / smart devices
 */

import { NativeAudio } from '@capgo/native-audio';

import type { VibeExecutionLayer } from './player-engine.service';

// ── Internal state ─────────────────────────────────────────────────────────────

/**
 * Tracks which assetIds have been preloaded on the native side.
 * This is the primary guard for all operations.
 *
 * NOTE: In live-reload mode (`ionic cap run android -l`) hot-module
 * replacement re-evaluates this module and clears this Set, but native audio
 * continues playing. After a hot reload, call preloadLoopLayer() again
 * (or stopLoopLayer() + preloadLoopLayer()) to resync before any operation.
 */
const _preloaded = new Set<string>();

// ── Helpers ────────────────────────────────────────────────────────────────────

function _assetId(layer: VibeExecutionLayer): string {
  return `vibe-layer-${layer.soundId}`;
}

/**
 * Converts our 0–100 backend volume to the 0.1–1.0 range expected by NativeAudio.
 * The plugin clamps at 0.1 as minimum — true silence is handled by stopping.
 */
function _toPluginVolume(vol100: number): number {
  const clamped = Math.max(0, Math.min(100, vol100));
  return Math.max(0.1, clamped / 100);
}

function _warn(fn: string, assetId: string, reason: string, extra?: unknown): void {
  console.warn(`[NativeAudioPOC] ${fn}(${assetId}): ${reason}`, extra ?? '');
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Preloads a single loop layer using a remote HTTPS URL.
 * Safe to call multiple times — skips if already preloaded.
 */
export async function preloadLoopLayer(layer: VibeExecutionLayer): Promise<void> {
  if (layer.playMode !== 'loop') {
    _warn('preloadLoopLayer', _assetId(layer), 'rejected — playMode is not "loop"');
    return;
  }

  const url = layer.fileUrl?.trim();
  if (!url || !url.startsWith('http')) {
    _warn('preloadLoopLayer', _assetId(layer), 'rejected — invalid or non-HTTPS fileUrl', url);
    return;
  }

  const assetId = _assetId(layer);

  if (_preloaded.has(assetId)) {
    console.log(`[NativeAudioPOC] preloadLoopLayer(${assetId}): already preloaded, skipping`);
    return;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath: url,
      isUrl: true,
      volume: _toPluginVolume(layer.volume),
      audioChannelNum: 1,
    });
    _preloaded.add(assetId);
    console.log(`[NativeAudioPOC] preloadLoopLayer(${assetId}): ok — vol=${layer.volume}/100`);
  } catch (err) {
    _warn('preloadLoopLayer', assetId, 'preload() failed', err);
  }
}

/**
 * Starts native loop playback for a preloaded layer.
 *
 * Uses NativeAudio.loop() which maps to MediaPlayer.setLooping(true) on Android.
 * This is the simplest and most reliable way to loop on native — no gap between
 * iterations, no complete-event listener needed, and pause/resume work
 * natively against the same MediaPlayer instance.
 *
 * Preloads automatically if not yet preloaded.
 */
export async function playLoopLayer(layer: VibeExecutionLayer): Promise<void> {
  if (layer.playMode !== 'loop') {
    _warn('playLoopLayer', _assetId(layer), 'rejected — playMode is not "loop"');
    return;
  }

  const assetId = _assetId(layer);

  // Auto-preload if caller skipped the preload step
  if (!_preloaded.has(assetId)) {
    await preloadLoopLayer(layer);
    if (!_preloaded.has(assetId)) {
      _warn('playLoopLayer', assetId, 'aborting — preload failed');
      return;
    }
  }

  try {
    await NativeAudio.loop({ assetId });
    console.log(`[NativeAudioPOC] playLoopLayer(${assetId}): loop started natively`);
  } catch (err) {
    _warn('playLoopLayer', assetId, 'loop() failed', err);
  }
}

/**
 * Pauses the native audio.
 *
 * Guard: only skips if the asset was never preloaded (_preloaded).
 * We intentionally do NOT guard on a separate "is playing" flag because
 * that flag can desync from native state (hot reload, bridge exceptions).
 * The native plugin handles "pause while already paused" gracefully.
 */
export async function pauseLoopLayer(layer: VibeExecutionLayer): Promise<void> {
  _warn('pauseLoopLayer', _assetId(layer), 'pausing layer');
  const assetId = _assetId(layer);

  if (!_preloaded.has(assetId)) {
    _warn('pauseLoopLayer', assetId, 'not preloaded — nothing to pause');
    return;
  }

  try {
    await NativeAudio.pause({ assetId });
    console.log(`[NativeAudioPOC] pauseLoopLayer(${assetId}): paused`);
  } catch (err) {
    _warn('pauseLoopLayer', assetId, 'pause() failed', err);
  }
}

/**
 * Resumes a paused native loop layer.
 *
 * Same guard rationale as pauseLoopLayer — uses _preloaded only.
 */
export async function resumeLoopLayer(layer: VibeExecutionLayer): Promise<void> {
  const assetId = _assetId(layer);

  if (!_preloaded.has(assetId)) {
    _warn('resumeLoopLayer', assetId, 'not preloaded — call playLoopLayer() first');
    return;
  }

  try {
    await NativeAudio.resume({ assetId });
    console.log(`[NativeAudioPOC] resumeLoopLayer(${assetId}): resumed`);
  } catch (err) {
    _warn('resumeLoopLayer', assetId, 'resume() failed', err);
  }
}

/**
 * Stops and unloads a layer, releasing native resources.
 * After stop, the layer must be preloaded again before playing.
 */
export async function stopLoopLayer(layer: VibeExecutionLayer): Promise<void> {
  const assetId = _assetId(layer);

  if (!_preloaded.has(assetId)) {
    console.log(`[NativeAudioPOC] stopLoopLayer(${assetId}): not loaded, nothing to stop`);
    return;
  }

  try {
    await NativeAudio.stop({ assetId });
  } catch { /* ignore — may already be stopped */ }

  try {
    await NativeAudio.unload({ assetId });
  } catch { /* ignore */ }

  _preloaded.delete(assetId);
  console.log(`[NativeAudioPOC] stopLoopLayer(${assetId}): stopped and unloaded`);
}
