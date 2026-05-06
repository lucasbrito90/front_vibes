/**
 * audio-player.service.ts — Phase 3 (loop + once + interval + fades)
 *
 * ## Pause vs Stop
 * - pauseAll: pauses audio, clears timeouts and fade RAF, stores remaining ms for resume.
 *   Does NOT reset currentTime or clear src on pause.
 * - stopLayer/stopAll: hard teardown — timers cleared, fades cancelled, currentTime = 0, src cleared.
 *
 * ## Fade + pause/resume (Phase 3 — intentional simplicity)
 * - Active fade-in or fade-out RAF chains are cancelled on pause; playback resumes at whatever
 *   volume the element already has (frozen). We do not reconstruct the fade envelope.
 * - Remaining layer wall-clock lifetime is stored in pendingDurationRemainingMs; on resume a
 *   single timeout calls stopLayer — fade-out is not re-scheduled after pause (no sample-perfect
 *   fade resume).
 *
 * ## Interval mode — fades
 * - Each tick runs fade-in when fadeInSeconds > 0.
 * - Per-tick fade-out is not implemented (short clips); layer-level duration still uses fade-out
 *   when stopping the whole layer while audio is playing.
 *
 * ## Interval mode — other limitations
 * - Next tick is scheduled after `ended` (gap = repeatIntervalSeconds). If `ended` never fires,
 *   the chain stalls.
 */

import type { PlayMode } from './vibe-sound.service';
import type { VibeExecutionLayer } from './player-engine.service';
import { hasValidExecutionFileUrl } from './player-engine.service';

// ── Internal state ────────────────────────────────────────────────────────────

interface ManagedLayer {
  soundId: number;
  layer: VibeExecutionLayer;

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

let _sessionEndedCallback: (() => void) | null = null;

export function setSessionEndedCallback(cb: (() => void) | null): void {
  _sessionEndedCallback = cb;
}

function _notifySessionEndedIfEmpty(): void {
  if (!_layers.size) {
    _sessionPaused = false;
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
      managed.layerAbsoluteStopEpochMs = null;
      stopLayer(layer.soundId);
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

function _startLoopAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
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

function _startOnceAudio(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  const audio = new Audio(layer.fileUrl);
  audio.loop = false;
  const target = _clampVolume(layer.volume);
  managed.audio = audio;

  const handler = (): void => {
    if (managed.onceEndedHandler !== handler) return;
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

  _layers.delete(soundId);
  _notifySessionEndedIfEmpty();
}

// ── Session API ─────────────────────────────────────────────────────────────────

function playPlan(layers: VibeExecutionLayer[]): void {
  stopAll();
  _sessionPaused = false;
  for (const layer of layers) {
    playLayer(layer);
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
  if (!_layers.size) return;

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

    if (managed.audio !== null) {
      managed.audio.pause();
    }
  }
}

function resumeAll(): void {
  if (!_sessionPaused || !_layers.size) return;

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

    // ── Active audio (loop / once / interval mid-tick) ─────────
    if (managed.audio !== null) {
      _resumeLayerDurationAfterPause(managed, layer);
      if (!_layers.has(layer.soundId)) continue;

      managed.audio.play().catch((error) => _logPlayFailure(layer, error));
    }
  }
}

function stopAll(): void {
  _sessionPaused = false;
  const ids = [..._layers.keys()];
  if (!ids.length) return;
  for (const soundId of ids) {
    stopLayer(soundId);
  }
}

function hasActiveLayers(): boolean {
  return _layers.size > 0;
}

function isSessionPaused(): boolean {
  return _sessionPaused;
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
};
