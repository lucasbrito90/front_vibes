/**
 * audio-player.service.ts — Phase 5 (native loop + native once + HTML interval + fades)
 *
 * ## Audio backend per play mode
 * - loop:     @capgo/native-audio on native platforms (Android/iOS).
 *             Falls back to HTMLAudioElement on web (ionic serve).
 * - once:     @capgo/native-audio on native platforms (Android/iOS).
 *             Falls back to HTMLAudioElement on web (ionic serve), or if
 *             any native step (preload / play) fails.
 * - interval: HTMLAudioElement (unchanged).
 *
 * ## Native loop lifecycle
 * - preload() + loop() on start. pause() / resume() / stop()+unload() for control.
 * - All NativeAudio calls are fire-and-forget (async) to preserve the synchronous
 *   public API. Errors are logged but do not crash the session.
 * - If preload or loop fails, the layer falls back to HTMLAudioElement.
 *
 * ## Native once lifecycle
 * - preload() + play() on start. pause() / resume() / stop()+unload() for control.
 * - Completion is detected via a single global NativeAudio.addListener('complete')
 *   that dispatches to per-layer callbacks keyed by assetId. This avoids
 *   accumulating per-layer listeners and uses the official plugin API.
 * - On completion the layer is torn down and _notifySessionEndedIfEmpty() fires,
 *   exactly mirroring the HTMLAudioElement 'ended' path.
 * - If preload or play fails, the layer falls back to HTMLAudioElement.
 *
 * ## Pause vs Stop
 * - pauseAll: pauses audio (native + HTML), clears timeouts and fade RAF, stores
 *   remaining ms for resume. Does NOT reset currentTime or clear src on pause.
 * - stopLayer/stopAll: hard teardown — timers cleared, fades cancelled, native
 *   stop+unload (or HTML currentTime=0/src='').
 *
 * ## Fade + pause/resume (Phase 3 — intentional simplicity)
 * - Active fade-in or fade-out RAF chains are cancelled on pause; playback resumes at
 *   whatever volume the element already has (frozen). Fade envelope is not reconstructed.
 * - Fade in/out for native loop layers is NOT yet implemented (Phase 4 scope limit).
 *
 * ## Interval mode — other limitations
 * - Next tick is scheduled after `ended` (gap = repeatIntervalSeconds). If `ended`
 *   never fires the chain stalls.
 */

import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeAudio } from '@capgo/native-audio';
import type { PlayMode } from './vibe-sound.service';
import type { VibeExecutionLayer } from './player-engine.service';
import { hasValidExecutionFileUrl } from './player-engine.service';
import { createLogger } from '@/utils/player-debug';

const log = createLogger('AudioService');

/** True when running inside a native Capacitor app (Android / iOS). */
const _isNativePlatform = Capacitor.isNativePlatform();

// ── Internal state ────────────────────────────────────────────────────────────

interface ManagedLayer {
  soundId: number;
  layer: VibeExecutionLayer;

  /**
   * True when this layer is backed by @capgo/native-audio instead of HTMLAudioElement.
   * Set synchronously in _startLoopAudio before the async native calls begin.
   */
  isNative: boolean;

  audio: HTMLAudioElement | null;

  startTimerId: ReturnType<typeof setTimeout> | null;
  durationTimerId: ReturnType<typeof setTimeout> | null;
  /** interval: silence gap before next tick */
  intervalTimerId: ReturnType<typeof setTimeout> | null;

  /** Active fade-in or fade-out animation frame (never both). */
  fadeRafId: number | null;

  /** Wall-clock instant when the layer must be fully stopped (audio start + duration). */
  layerAbsoluteStopEpochMs: number | null;

  startFiresAtEpochMs: number | null;
  durationFiresAtEpochMs: number | null;
  intervalFiresAtEpochMs: number | null;

  pendingStartRemainingMs: number | null;
  pendingDurationRemainingMs: number | null;
  pendingIntervalRemainingMs: number | null;

  /** once: remove on stopLayer */
  onceEndedHandler: (() => void) | null;

  intervalTickEndedHandler: (() => void) | null;
  intervalTickErrorHandler: (() => void) | null;
}

const _layers = new Map<number, ManagedLayer>();

let _sessionPaused = false;

/**
 * Set to true during playPlan()/restartPlan() to suppress the session-ended
 * callback while the old layers are being torn down and new ones are being
 * registered. Without this guard, the callback fires as soon as stopAll()
 * clears the previous layers — before the new playLayer() calls have run —
 * which causes clearCurrentVibe() to execute in the middle of a plan rebuild,
 * leaving currentVibeId = null even though new layers are added a few
 * milliseconds later. This prevents the Mini Player from appearing.
 */
let _playPlanInProgress = false;

/**
 * Set to true during explicit stopAll() calls initiated by the user (e.g.
 * store.stopPlayback()). This suppresses the session-ended callback so that
 * the Pinia store's stopPlayback() action is the single place that resets
 * playbackState/currentVibeId — avoiding the double clearCurrentVibe() that
 * was visible in the logs when stopAll() triggered the callback synchronously
 * from within stopLayer(), then stopPlayback() cleared the state again.
 *
 * The session-ended callback is still fired for NATURAL endings:
 * - duration timers that fire while the session is active
 * - all layers finishing naturally without an explicit stop
 */
let _stopAllExplicit = false;

let _sessionEndedCallback: (() => void) | null = null;

export function setSessionEndedCallback(cb: (() => void) | null): void {
  _sessionEndedCallback = cb;
}

/**
 * Fires the session-ended callback only when ALL of the following are true:
 *   1. No layers remain in the map.
 *   2. The session is NOT currently paused.
 *
 * Condition 2 is critical for lifecycle awareness: when the app goes to
 * background we call pauseAll() which keeps layers in the map but sets
 * _sessionPaused = true. However, if an `ended` event that was already
 * queued by the browser fires AFTER pauseAll() ran, stopLayer() will
 * remove the last layer while _sessionPaused is still true. Without the
 * guard, _sessionEndedCallback (which clears currentVibeId and sets
 * playbackState → idle) would fire, making the mini player disappear.
 *
 * The callback fires correctly in the normal stop path because stopAll()
 * explicitly sets _sessionPaused = false before calling stopLayer().
 *
 * Condition 3 (_playPlanInProgress): suppressed while playPlan() rebuilds the
 * session. stopAll() is called at the start of playPlan() to tear down the
 * previous plan; without this guard the callback fires between teardown and
 * the new playLayer() registrations, causing clearCurrentVibe() to execute in
 * the middle of a restart — which makes the Mini Player disappear.
 */
function _notifySessionEndedIfEmpty(): void {
  if (!_layers.size && !_sessionPaused && !_playPlanInProgress && !_stopAllExplicit) {
    log.debug('sessionEnded — firing callback (natural end)', {
      layers:     _layers.size,
      paused:     _sessionPaused,
      inProgress: _playPlanInProgress,
      explicit:   _stopAllExplicit,
    });
    _sessionEndedCallback?.();
  }
}

function _clampVolume(vol100: number): number {
  return Math.max(0, Math.min(1, vol100 / 100));
}

function _clampUnit(vol: number): number {
  return Math.max(0, Math.min(1, vol));
}

/** Cancel linear fade RAF for this layer (fade-in or fade-out). */
function _clearFadeAnimations(managed: ManagedLayer): void {
  if (managed.fadeRafId !== null) {
    cancelAnimationFrame(managed.fadeRafId);
    managed.fadeRafId = null;
  }
}

/**
 * Ramp element volume from 0 → target using requestAnimationFrame.
 * Clears any prior fade RAF on this layer first.
 * (`managed` owns the RAF id for cancellation — not sample-perfect across pause.)
 */
function applyFadeIn(
  audio: HTMLAudioElement,
  targetVolume: number,
  fadeInSeconds: number,
  managed: ManagedLayer,
): void {
  _clearFadeAnimations(managed);

  const target = _clampUnit(targetVolume);

  if (fadeInSeconds <= 0) {
    audio.volume = target;
    return;
  }

  audio.volume = 0;
  const startMs = performance.now();
  const durationMs = fadeInSeconds * 1_000;

  const tick = (now: number): void => {
    if (!_layers.has(managed.soundId) || managed.audio !== audio) {
      managed.fadeRafId = null;
      return;
    }
    const elapsed = now - startMs;
    const u = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    audio.volume = _clampUnit(target * u);
    if (u >= 1) {
      managed.fadeRafId = null;
      return;
    }
    managed.fadeRafId = requestAnimationFrame(tick);
  };

  managed.fadeRafId = requestAnimationFrame(tick);
}

/**
 * Ramp element volume from current → 0 using requestAnimationFrame, then run onComplete.
 */
function applyFadeOut(
  audio: HTMLAudioElement,
  fadeOutSeconds: number,
  onComplete: () => void,
  managed: ManagedLayer,
): void {
  _clearFadeAnimations(managed);

  const startVol = _clampUnit(audio.volume);

  if (fadeOutSeconds <= 0 || startVol <= 0) {
    audio.volume = 0;
    onComplete();
    return;
  }

  const startMs = performance.now();
  const durationMs = fadeOutSeconds * 1_000;

  const tick = (now: number): void => {
    if (!_layers.has(managed.soundId) || managed.audio !== audio) {
      managed.fadeRafId = null;
      return;
    }
    const elapsed = now - startMs;
    const u = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    audio.volume = _clampUnit(startVol * (1 - u));
    if (u >= 1) {
      managed.fadeRafId = null;
      audio.volume = 0;
      onComplete();
      return;
    }
    managed.fadeRafId = requestAnimationFrame(tick);
  };

  managed.fadeRafId = requestAnimationFrame(tick);
}

function _logPlayFailure(layer: VibeExecutionLayer, error: unknown): void {
  console.warn('[AudioPlayer] Failed to play layer', {
    soundId:   layer.soundId,
    soundName: layer.soundName,
    fileUrl:   layer.fileUrl,
    playMode:  layer.playMode as PlayMode,
    error,
  });
}

// ── Native audio helpers (@capgo/native-audio) ────────────────────────────────

/** assetIds of layers successfully preloaded on the native side. */
const _nativeLayers = new Set<string>();

/**
 * Single global NativeAudio 'complete' listener handle.
 * Initialized lazily on the first native once layer; never removed (module lifetime).
 * Dispatches to per-layer callbacks stored in _nativeOnceCompleteCallbacks.
 */
let _nativeOnceCompleteHandle: PluginListenerHandle | null = null;

/**
 * Map from assetId → teardown callback for native once layers.
 * Entries are removed either when the completion event fires or when
 * stopLayer() is called explicitly (to avoid spurious teardown after a stop).
 */
const _nativeOnceCompleteCallbacks = new Map<string, () => void>();

async function _ensureNativeOnceCompleteListener(): Promise<void> {
  if (_nativeOnceCompleteHandle) return;
  try {
    _nativeOnceCompleteHandle = await NativeAudio.addListener(
      'complete',
      ({ assetId }: { assetId: string }) => {
        log.debug('[NativeAudio][Once] complete event', { assetId });
        const cb = _nativeOnceCompleteCallbacks.get(assetId);
        if (cb) {
          _nativeOnceCompleteCallbacks.delete(assetId);
          cb();
        }
      },
    );
    log.debug('native once — complete listener registered');
  } catch (err) {
    log.warn('native once — failed to register complete listener', { err: String(err) });
  }
}

function _nativeAssetId(soundId: number): string {
  return `vibe-layer-${soundId}`;
}

/**
 * Converts 0–100 backend volume to the 0.1–1.0 range expected by NativeAudio.
 * The plugin does not support true silence via volume; stopping is used instead.
 */
function _toNativeVolume(vol100: number): number {
  return Math.max(0.1, Math.min(1, vol100 / 100));
}

function _logNativeFailure(fn: string, assetId: string, error: unknown): void {
  console.warn(`[AudioPlayer] NativeAudio.${fn}(${assetId}) failed`, error);
}

/** Stops and unloads a native asset. Fire-and-forget safe. */
async function _stopNativeAsset(assetId: string): Promise<void> {
  if (!_nativeLayers.has(assetId)) return;
  try { await NativeAudio.stop({ assetId }); } catch { /* already stopped */ }
  try { await NativeAudio.unload({ assetId }); } catch { /* already unloaded */ }
  _nativeLayers.delete(assetId);
}

/**
 * Preloads and starts native looping for a layer.
 * Falls back to HTMLAudioElement if any native step fails.
 */
async function _startLoopAudioNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);
  log.debug('native preload — start', { soundId: layer.soundId, assetId });

  // Unload stale asset from a previous play (e.g. restart)
  if (_nativeLayers.has(assetId)) {
    log.debug('native preload — unloading stale asset', { assetId });
    await _stopNativeAsset(assetId);
  }

  // Guard: layer may have been stopped while we awaited above
  if (!_layers.has(layer.soundId)) {
    log.warn('native preload — layer removed while awaiting stop, aborting', { soundId: layer.soundId });
    return;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath: layer.fileUrl,
      isUrl: true,
      volume: _toNativeVolume(layer.volume),
      audioChannelNum: 1,
    });
    _nativeLayers.add(assetId);
    log.debug('native preload — OK', { assetId, nativeCount: _nativeLayers.size });
  } catch (err) {
    _logNativeFailure('preload', assetId, err);
    log.warn('native preload — FAILED, falling back to HTML', { assetId, err: String(err) });
    if (_layers.has(layer.soundId)) {
      // Preload failed — fall back to HTMLAudioElement for this layer
      managed.isNative = false;
      _startLoopAudioHtml(layer, managed, 'preload-failed');
    }
    return;
  }

  if (!_layers.has(layer.soundId)) {
    // Layer was stopped while preloading — clean up the native asset
    log.warn('native preload — layer removed while preloading, unloading asset', { assetId });
    void _stopNativeAsset(assetId);
    return;
  }

  try {
    await NativeAudio.loop({ assetId });
    log.debug('native loop — started', {
      assetId,
      soundId:      layer.soundId,
      sessionPaused: _sessionPaused,
      layersSize:   _layers.size,
    });
    // Race-condition guard: if the session was paused while we were preloading,
    // immediately pause the native player so state stays consistent.
    if (_sessionPaused && _nativeLayers.has(assetId)) {
      log.debug('native loop — session was paused during preload, pausing immediately', { assetId });
      void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause (race)', assetId, e));
    }
  } catch (err) {
    _logNativeFailure('loop', assetId, err);
    log.warn('native loop — FAILED, falling back to HTML', { assetId, err: String(err) });
    _nativeLayers.delete(assetId);
    if (_layers.has(layer.soundId)) {
      // loop() failed — fall back to HTMLAudioElement
      managed.isNative = false;
      _startLoopAudioHtml(layer, managed, 'loop-failed');
    }
  }
}

function _clearStartTimer(managed: ManagedLayer): void {
  if (managed.startTimerId !== null) {
    clearTimeout(managed.startTimerId);
    managed.startTimerId = null;
  }
}

function _clearDurationTimer(managed: ManagedLayer): void {
  if (managed.durationTimerId !== null) {
    clearTimeout(managed.durationTimerId);
    managed.durationTimerId = null;
  }
}

function _clearIntervalTimer(managed: ManagedLayer): void {
  if (managed.intervalTimerId !== null) {
    clearTimeout(managed.intervalTimerId);
    managed.intervalTimerId = null;
  }
}

function _detachIntervalTickListeners(managed: ManagedLayer): void {
  const audio = managed.audio;
  if (!audio) return;

  if (managed.intervalTickEndedHandler) {
    audio.removeEventListener('ended', managed.intervalTickEndedHandler);
    managed.intervalTickEndedHandler = null;
  }
  if (managed.intervalTickErrorHandler) {
    audio.removeEventListener('error', managed.intervalTickErrorHandler);
    managed.intervalTickErrorHandler = null;
  }
}

function _scheduleLayerLifetime(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.layerAbsoluteStopEpochMs = null;

  if (layer.durationSeconds == null) return;

  _clearDurationTimer(managed);

  const durMs = layer.durationSeconds * 1_000;
  managed.layerAbsoluteStopEpochMs = Date.now() + durMs;

  const fadeOutMs =
    layer.fadeOutSeconds > 0 ? Math.min(layer.fadeOutSeconds * 1_000, durMs) : 0;

  if (fadeOutMs <= 0) {
    managed.durationFiresAtEpochMs = managed.layerAbsoluteStopEpochMs;
    managed.durationTimerId = setTimeout(() => {
      managed.durationTimerId        = null;
      managed.durationFiresAtEpochMs = null;
      managed.layerAbsoluteStopEpochMs = null;
      stopLayer(layer.soundId);
    }, durMs);
    return;
  }

  const fadeStartDelayMs = durMs - fadeOutMs;

  managed.durationFiresAtEpochMs = Date.now() + fadeStartDelayMs;

  managed.durationTimerId = setTimeout(() => {
    managed.durationTimerId        = null;
    managed.durationFiresAtEpochMs = null;

    if (!_layers.has(layer.soundId)) return;

    const audio = managed.audio;
    if (!audio) {
      /*
       * No HTMLAudioElement — this is a native loop layer.
       *
       * Fade-out is not yet implemented for native audio.
       * We must NOT stop immediately: the outer timer fired at
       * (durMs - fadeOutMs), so we still owe the layer another fadeOutMs
       * before the configured durationSeconds has truly elapsed.
       * Schedule the remaining stop so the total lifetime = durMs.
       *
       * Stopping at (durMs - fadeOutMs) was the original (broken) behaviour
       * that caused native layers to be torn down far too early — in extreme
       * cases (fadeOutSeconds >= durationSeconds → fadeStartDelayMs = 0) the
       * layer was destroyed on the very next event-loop tick, before the UI
       * could even render the 'playing' state, making the Mini Player
       * invisible and playbackState flip back to 'idle' immediately.
       */
      managed.durationTimerId = setTimeout(() => {
        managed.durationTimerId          = null;
        managed.layerAbsoluteStopEpochMs = null;
        if (_layers.has(layer.soundId)) stopLayer(layer.soundId);
      }, fadeOutMs);
      return;
    }

    const fadeSec = fadeOutMs / 1_000;
    applyFadeOut(audio, fadeSec, () => {
      stopLayer(layer.soundId);
    }, managed);
  }, fadeStartDelayMs);
}

function _beginLayerAfterDelay(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.startTimerId        = null;
  managed.startFiresAtEpochMs = null;
  managed.pendingStartRemainingMs = null;

  if (_sessionPaused) return;

  _scheduleLayerLifetime(layer, managed);

  switch (layer.playMode) {
    case 'loop':
      _startLoopAudio(layer, managed);
      break;
    case 'once':
      _startOnceAudio(layer, managed);
      break;
    case 'interval':
      _intervalPlayTick(layer, managed);
      break;
  }
}

/**
 * HTMLAudioElement loop implementation — used as fallback on web and when
 * native preload/loop fails.
 * Fade in/out is fully supported here (Phase 3).
 */
function _startLoopAudioHtml(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
  reason: 'web-platform' | 'preload-failed' | 'loop-failed' = 'web-platform',
): void {
  log.debug('HTML loop — start', { soundId: layer.soundId, reason });
  const audio = new Audio(layer.fileUrl);
  audio.loop = true;
  const target = _clampVolume(layer.volume);
  managed.audio = audio;

  if (layer.fadeInSeconds > 0) {
    audio.volume = 0;
    audio.play().catch((error) => _logPlayFailure(layer, error));
    applyFadeIn(audio, target, layer.fadeInSeconds, managed);
  } else {
    audio.volume = target;
    audio.play().catch((error) => _logPlayFailure(layer, error));
  }
}

/**
 * Starts loop playback. On native platforms uses @capgo/native-audio;
 * on web falls back to HTMLAudioElement. Also falls back to HTML if any
 * native step fails.
 *
 * NOTE: fade in/out is not yet implemented for native loop layers.
 */
function _startLoopAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  if (_isNativePlatform) {
    log.debug('loop backend — Native (@capgo/native-audio)', { soundId: layer.soundId });
    managed.isNative = true;
    void _startLoopAudioNative(layer, managed);
  } else {
    log.debug('loop backend — HTMLAudioElement (web platform)', { soundId: layer.soundId });
    _startLoopAudioHtml(layer, managed, 'web-platform');
  }
}

/**
 * HTMLAudioElement once implementation — used on web and as fallback when
 * any native once step (preload / play) fails.
 */
function _startOnceAudioHtml(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  log.debug('HTML once — start', { soundId: layer.soundId });
  const audio = new Audio(layer.fileUrl);
  audio.loop = false;
  const target = _clampVolume(layer.volume);
  managed.audio = audio;

  const handler = (): void => {
    if (managed.onceEndedHandler !== handler) return;
    /*
     * Guard: if the session is paused, the `ended` event may have been
     * enqueued in the browser event loop before pauseAll() ran (the clip
     * was finishing exactly as the app went to background). Do NOT tear
     * down the layer here — resumeAll() will handle it correctly later.
     * Without this guard, stopLayer() would be called while _sessionPaused
     * is true, and _notifySessionEndedIfEmpty would clear the vibe context.
     */
    if (_sessionPaused) return;
    managed.onceEndedHandler = null;
    audio.removeEventListener('ended', handler);
    stopLayer(layer.soundId);
  };

  managed.onceEndedHandler = handler;
  audio.addEventListener('ended', handler);

  if (layer.fadeInSeconds > 0) {
    audio.volume = 0;
    audio.play().catch((error) => _logPlayFailure(layer, error));
    applyFadeIn(audio, target, layer.fadeInSeconds, managed);
  } else {
    audio.volume = target;
    audio.play().catch((error) => _logPlayFailure(layer, error));
  }
}

/**
 * Preloads and starts native once playback for a layer.
 * Uses NativeAudio.play() (not loop()). Completion is detected via the
 * global 'complete' event dispatched through _nativeOnceCompleteCallbacks.
 * Falls back to HTMLAudioElement if any native step fails.
 */
async function _startOnceAudioNative(
  layer: VibeExecutionLayer,
  managed: ManagedLayer,
): Promise<void> {
  const assetId = _nativeAssetId(layer.soundId);
  log.debug('[NativeAudio][Once] preload — start', { soundId: layer.soundId, assetId });

  // Ensure global complete listener is ready before we register a callback
  await _ensureNativeOnceCompleteListener();

  // Unload any stale asset from a previous play (e.g. restart)
  if (_nativeLayers.has(assetId)) {
    log.debug('[NativeAudio][Once] unloading stale asset', { assetId });
    await _stopNativeAsset(assetId);
  }

  // Guard: layer may have been stopped while awaiting above
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Once] layer removed while awaiting stale stop, aborting', { soundId: layer.soundId });
    return;
  }

  try {
    await NativeAudio.preload({
      assetId,
      assetPath: layer.fileUrl,
      isUrl: true,
      volume: _toNativeVolume(layer.volume),
      audioChannelNum: 1,
    });
    _nativeLayers.add(assetId);
    log.debug('[NativeAudio][Once] preload — OK', { assetId, nativeCount: _nativeLayers.size });
  } catch (err) {
    _logNativeFailure('preload (once)', assetId, err);
    log.warn('[NativeAudio][Once] preload — FAILED, falling back to HTML', { assetId, err: String(err) });
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      _startOnceAudioHtml(layer, managed);
    }
    return;
  }

  // Guard again: layer may have been stopped during preload
  if (!_layers.has(layer.soundId)) {
    log.warn('[NativeAudio][Once] layer removed during preload, unloading asset', { assetId });
    void _stopNativeAsset(assetId);
    return;
  }

  // Register completion callback BEFORE play() to avoid a race where the
  // audio completes before the callback is installed (very short sounds).
  _nativeOnceCompleteCallbacks.set(assetId, () => {
    log.debug('[NativeAudio][Once] complete — fired', { assetId, sessionPaused: _sessionPaused });
    /*
     * Guard: NativeAudio should not fire 'complete' while paused, but as a
     * safety net we skip teardown if the session is currently paused.
     * The player will handle cleanup when the user explicitly stops.
     */
    if (_sessionPaused) {
      log.warn('[NativeAudio][Once] complete fired while paused — ignoring', { assetId });
      return;
    }
    _nativeLayers.delete(assetId);
    if (_layers.has(layer.soundId)) {
      stopLayer(layer.soundId);
    }
  });

  try {
    await NativeAudio.play({ assetId });
    log.debug('[NativeAudio][Once] play — started', {
      assetId,
      soundId:      layer.soundId,
      sessionPaused: _sessionPaused,
      layersSize:   _layers.size,
    });
    // Race guard: if the session was paused while we were preloading,
    // immediately pause the native player so state stays consistent.
    if (_sessionPaused && _nativeLayers.has(assetId)) {
      log.debug('[NativeAudio][Once] session paused during preload, pausing immediately', { assetId });
      void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause (race once)', assetId, e));
    }
  } catch (err) {
    _logNativeFailure('play (once)', assetId, err);
    log.warn('[NativeAudio][Once] play — FAILED, falling back to HTML', { assetId, err: String(err) });
    // Clean up: remove native registration and stale completion callback
    _nativeLayers.delete(assetId);
    _nativeOnceCompleteCallbacks.delete(assetId);
    if (_layers.has(layer.soundId)) {
      managed.isNative = false;
      _startOnceAudioHtml(layer, managed);
    }
  }
}

/**
 * Starts once playback. On native platforms uses @capgo/native-audio;
 * on web falls back to HTMLAudioElement. Also falls back to HTML if any
 * native step fails.
 */
function _startOnceAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  if (_isNativePlatform) {
    log.debug('once backend — Native (@capgo/native-audio)', { soundId: layer.soundId });
    managed.isNative = true;
    void _startOnceAudioNative(layer, managed);
  } else {
    log.debug('once backend — HTMLAudioElement (web platform)', { soundId: layer.soundId });
    _startOnceAudioHtml(layer, managed);
  }
}

function _scheduleNextIntervalGap(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  const gapSec = layer.repeatIntervalSeconds ?? 0;
  const gapMs  = gapSec * 1_000;

  if (gapMs < 1_000) return;

  _clearIntervalTimer(managed);

  managed.intervalFiresAtEpochMs = Date.now() + gapMs;
  managed.intervalTimerId = setTimeout(() => {
    managed.intervalTimerId        = null;
    managed.intervalFiresAtEpochMs = null;
    if (!_layers.has(layer.soundId) || _sessionPaused) return;
    _intervalPlayTick(layer, managed);
  }, gapMs);
}

function _intervalPlayTick(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  _clearIntervalTimer(managed);
  managed.intervalFiresAtEpochMs = null;

  if (_sessionPaused) return;

  /* Normal path: gap elapsed → previous tick already torn down */
  if (managed.audio !== null) {
    _tearDownIntervalTickAudio(managed);
  }

  const audio = new Audio(layer.fileUrl);
  audio.loop = false;
  const target = _clampVolume(layer.volume);

  const onEnded = (): void => {
    _tearDownIntervalTickAudio(managed);
    if (!_layers.has(layer.soundId) || _sessionPaused) return;
    _scheduleNextIntervalGap(layer, managed);
  };

  const onError = (): void => {
    _tearDownIntervalTickAudio(managed);
    if (!_layers.has(layer.soundId) || _sessionPaused) return;
    _scheduleNextIntervalGap(layer, managed);
  };

  managed.intervalTickEndedHandler = onEnded;
  managed.intervalTickErrorHandler = onError;
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  managed.audio = audio;

  if (layer.fadeInSeconds > 0) {
    audio.volume = 0;
    audio.play().catch((error) => {
      _logPlayFailure(layer, error);
      onError();
    });
    applyFadeIn(audio, target, layer.fadeInSeconds, managed);
  } else {
    audio.volume = target;
    audio.play().catch((error) => {
      _logPlayFailure(layer, error);
      onError();
    });
  }
}

function _tearDownIntervalTickAudio(managed: ManagedLayer): void {
  _clearFadeAnimations(managed);
  const audio = managed.audio;
  _detachIntervalTickListeners(managed);

  if (audio) {
    audio.pause();
    audio.src = '';
    managed.audio = null;
  }
}

// ── Public per-layer API ──────────────────────────────────────────────────────

function playLayer(layer: VibeExecutionLayer): void {
  stopLayer(layer.soundId);

  if (!hasValidExecutionFileUrl(layer.fileUrl)) {
    log.warn('playLayer — skipped: invalid fileUrl', {
      soundId:  layer.soundId,
      playMode: layer.playMode as PlayMode,
    });
    console.warn('[AudioPlayer] Skipping layer — invalid fileUrl', {
      soundId:   layer.soundId,
      soundName: layer.soundName,
      fileUrl:   layer.fileUrl,
      playMode:  layer.playMode as PlayMode,
    });
    return;
  }

  if (layer.playMode === 'interval') {
    const ri = layer.repeatIntervalSeconds;
    if (ri == null || ri < 1) {
      log.warn('playLayer — skipped: invalid repeatIntervalSeconds', {
        soundId: layer.soundId,
        ri,
      });
      console.warn('[AudioPlayer] Skipping interval layer — invalid repeatIntervalSeconds', {
        soundId:   layer.soundId,
        soundName: layer.soundName,
        fileUrl:   layer.fileUrl,
        playMode:  'interval' as const,
      });
      return;
    }
  }

  const managed: ManagedLayer = {
    soundId:                      layer.soundId,
    layer,
    isNative:                     false,
    audio:                        null,
    startTimerId:                 null,
    durationTimerId:              null,
    intervalTimerId:              null,
    fadeRafId:                    null,
    layerAbsoluteStopEpochMs:     null,
    startFiresAtEpochMs:          null,
    durationFiresAtEpochMs:       null,
    intervalFiresAtEpochMs:       null,
    pendingStartRemainingMs:      null,
    pendingDurationRemainingMs:   null,
    pendingIntervalRemainingMs:   null,
    onceEndedHandler:             null,
    intervalTickEndedHandler:     null,
    intervalTickErrorHandler:     null,
  };

  _layers.set(layer.soundId, managed);
  log.debug('playLayer — registered', {
    soundId:     layer.soundId,
    playMode:    layer.playMode as PlayMode,
    startsAt:    layer.startsAtSeconds,
    duration:    layer.durationSeconds ?? null,
    layersSize:  _layers.size,
  });

  if (layer.startsAtSeconds > 0) {
    const delayMs = layer.startsAtSeconds * 1_000;
    managed.startFiresAtEpochMs = Date.now() + delayMs;
    managed.startTimerId = setTimeout(() => {
      managed.startTimerId        = null;
      managed.startFiresAtEpochMs = null;
      if (!_layers.has(layer.soundId)) return;
      _beginLayerAfterDelay(layer, managed);
    }, delayMs);
  } else {
    _beginLayerAfterDelay(layer, managed);
  }
}

function stopLayer(soundId: number): void {
  const managed = _layers.get(soundId);
  if (!managed) return;

  log.debug('stopLayer', {
    soundId,
    playMode:  managed.layer.playMode as PlayMode,
    isNative:  managed.isNative,
    layersAfter: _layers.size - 1,
  });

  _clearFadeAnimations(managed);
  _clearStartTimer(managed);
  _clearDurationTimer(managed);
  _clearIntervalTimer(managed);

  managed.startFiresAtEpochMs      = null;
  managed.durationFiresAtEpochMs   = null;
  managed.intervalFiresAtEpochMs   = null;
  managed.layerAbsoluteStopEpochMs = null;
  managed.pendingStartRemainingMs  = null;
  managed.pendingDurationRemainingMs = null;
  managed.pendingIntervalRemainingMs = null;

  if (managed.isNative) {
    // Remove once-completion callback BEFORE stopping the native asset to
    // prevent the 'complete' event from re-entering stopLayer() after an
    // explicit stop (the event may still fire transiently on some devices).
    _nativeOnceCompleteCallbacks.delete(_nativeAssetId(soundId));
    // Fire-and-forget: stop + unload the native asset asynchronously
    void _stopNativeAsset(_nativeAssetId(soundId));
  } else {
    const audio = managed.audio;

    if (managed.onceEndedHandler && audio) {
      audio.removeEventListener('ended', managed.onceEndedHandler);
      managed.onceEndedHandler = null;
    }

    _detachIntervalTickListeners(managed);

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      managed.audio = null;
    }
  }

  _layers.delete(soundId);
  _notifySessionEndedIfEmpty();
}

// ── Session API ─────────────────────────────────────────────────────────────────

function playPlan(layers: VibeExecutionLayer[]): void {
  log.debug('playPlan — start', {
    incomingLayers: layers.length,
    currentLayers:  _layers.size,
    isNativePlatform: _isNativePlatform,
  });
  // Suppress the session-ended callback while tearing down the previous plan
  // and registering new layers. The callback is re-evaluated at the end so
  // it fires correctly if ALL new layers fail validation (nothing in _layers).
  _playPlanInProgress = true;
  try {
    stopAll();
    _sessionPaused = false;
    for (const layer of layers) {
      playLayer(layer);
    }
  } finally {
    _playPlanInProgress = false;
    log.debug('playPlan — end', {
      registeredLayers: _layers.size,
      nativeLayers:     _nativeLayers.size,
    });
    // Fire now if every layer was skipped due to validation errors.
    _notifySessionEndedIfEmpty();
  }
}

function restartPlan(layers: VibeExecutionLayer[]): void {
  playPlan(layers);
}

/**
 * After pause: restore a single hard stop timer from remaining wall-clock lifetime.
 * Does not re-apply fade-out ramp (Phase 3 simplicity).
 */
function _resumeLayerDurationAfterPause(managed: ManagedLayer, layer: VibeExecutionLayer): void {
  const remDur = managed.pendingDurationRemainingMs;
  if (remDur === null) return;

  managed.pendingDurationRemainingMs = null;

  if (remDur <= 0) {
    managed.layerAbsoluteStopEpochMs = null;
    stopLayer(layer.soundId);
    return;
  }

  managed.layerAbsoluteStopEpochMs = Date.now() + remDur;
  managed.durationTimerId = setTimeout(() => {
    managed.durationTimerId          = null;
    managed.durationFiresAtEpochMs   = null;
    managed.layerAbsoluteStopEpochMs = null;
    stopLayer(layer.soundId);
  }, remDur);
}

function pauseAll(): void {
  log.debug('pauseAll', { layers: _layers.size, nativeLayers: _nativeLayers.size });
  if (!_layers.size) {
    log.debug('pauseAll — no layers, skipping');
    return;
  }

  _sessionPaused = true;

  for (const managed of _layers.values()) {
    const layer = managed.layer;

    if (managed.startTimerId !== null) {
      _clearStartTimer(managed);
      if (managed.startFiresAtEpochMs !== null) {
        managed.pendingStartRemainingMs = Math.max(0, managed.startFiresAtEpochMs - Date.now());
        managed.startFiresAtEpochMs     = null;
      }
    }

    if (managed.durationTimerId !== null) {
      _clearDurationTimer(managed);
    }
    managed.durationFiresAtEpochMs = null;

    if (managed.layerAbsoluteStopEpochMs !== null) {
      managed.pendingDurationRemainingMs = Math.max(
        0,
        managed.layerAbsoluteStopEpochMs - Date.now(),
      );
    } else {
      managed.pendingDurationRemainingMs = null;
    }

    _clearFadeAnimations(managed);

    if (managed.intervalTimerId !== null) {
      _clearIntervalTimer(managed);
      if (managed.intervalFiresAtEpochMs !== null) {
        managed.pendingIntervalRemainingMs = Math.max(0, managed.intervalFiresAtEpochMs - Date.now());
        managed.intervalFiresAtEpochMs     = null;
      }
    }

    if (managed.isNative) {
      const assetId = _nativeAssetId(managed.soundId);
      if (_nativeLayers.has(assetId)) {
        void NativeAudio.pause({ assetId }).catch((e) => _logNativeFailure('pause', assetId, e));
      }
    } else if (managed.audio !== null) {
      managed.audio.pause();
    }
  }
}

function resumeAll(): void {
  log.debug('resumeAll', {
    sessionPaused: _sessionPaused,
    layers:        _layers.size,
    nativeLayers:  _nativeLayers.size,
  });
  if (!_sessionPaused || !_layers.size) {
    log.debug('resumeAll — skipped (not paused or no layers)');
    return;
  }

  _sessionPaused = false;

  for (const managed of _layers.values()) {
    const layer = managed.layer;

    // ── Delayed start still pending ─────────────────────────────
    if (!managed.audio && managed.pendingStartRemainingMs !== null) {
      const ms = managed.pendingStartRemainingMs;
      managed.pendingStartRemainingMs = null;
      if (ms > 0) {
        managed.startFiresAtEpochMs = Date.now() + ms;
        managed.startTimerId = setTimeout(() => {
          managed.startTimerId        = null;
          managed.startFiresAtEpochMs = null;
          if (!_layers.has(layer.soundId)) return;
          _beginLayerAfterDelay(layer, managed);
        }, ms);
      } else {
        _beginLayerAfterDelay(layer, managed);
      }
      continue;
    }

    // ── Interval: waiting in gap (no tick audio) ───────────────
    if (layer.playMode === 'interval' && managed.audio === null && managed.pendingIntervalRemainingMs !== null) {
      const ms = managed.pendingIntervalRemainingMs;
      managed.pendingIntervalRemainingMs = null;

      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      if (ms > 0) {
        managed.intervalFiresAtEpochMs = Date.now() + ms;
        managed.intervalTimerId = setTimeout(() => {
          managed.intervalTimerId        = null;
          managed.intervalFiresAtEpochMs = null;
          if (!_layers.has(layer.soundId) || _sessionPaused) return;
          _intervalPlayTick(layer, managed);
        }, ms);
      } else if (!_sessionPaused) {
        _intervalPlayTick(layer, managed);
      }
      continue;
    }

    // ── Active native layer (loop or once) ───────────────────
    if (managed.isNative) {
      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      const assetId = _nativeAssetId(layer.soundId);
      if (_nativeLayers.has(assetId)) {
        void NativeAudio.resume({ assetId }).catch((e) => _logNativeFailure('resume', assetId, e));
      }
      continue;
    }

    // ── Active audio (HTML: once / interval mid-tick / loop fallback) ──────
    if (managed.audio !== null) {
      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      managed.audio.play().catch((error) => _logPlayFailure(layer, error));
    }
  }
}

function stopAll(): void {
  log.debug('stopAll', { layers: _layers.size, nativeLayers: _nativeLayers.size });
  _stopAllExplicit = true;
  try {
    _sessionPaused = false;
    const ids = [..._layers.keys()];
    for (const soundId of ids) {
      stopLayer(soundId);
    }
  } finally {
    _stopAllExplicit = false;
  }
}

function hasActiveLayers(): boolean {
  return _layers.size > 0;
}

function isSessionPaused(): boolean {
  return _sessionPaused;
}

/**
 * Returns the number of layers that would pass playLayer() validation.
 * Used by the store for optimistic state updates: if countValidLayers() > 0
 * the store can set playbackState = 'playing' before the async native operations
 * complete, ensuring the Mini Player appears on the first reactive flush.
 */
function countValidLayers(layers: VibeExecutionLayer[]): number {
  return layers.filter((layer) => {
    if (!hasValidExecutionFileUrl(layer.fileUrl)) return false;
    if (layer.playMode === 'interval') {
      return layer.repeatIntervalSeconds != null && layer.repeatIntervalSeconds >= 1;
    }
    return true;
  }).length;
}

export const audioPlayerService = {
  playPlan,
  restartPlan,
  pauseAll,
  resumeAll,
  stopAll,
  stopLayer,
  hasActiveLayers,
  isSessionPaused,
  countValidLayers,
};
