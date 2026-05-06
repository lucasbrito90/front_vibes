/**
 * audio-player.service.ts — Phase 1
 *
 * Loop layers only. Manages HTMLAudioElement + delayed-start + duration timers.
 *
 * ## Pause vs Stop
 * - **pauseAll**: `audio.pause()`, clears timeouts but keeps remaining delays in ms so
 *   resume can reschedule. Does NOT reset `currentTime` or clear `src`.
 * - **stopAll**: full teardown per layer — timers cleared, `currentTime = 0`, `src` cleared.
 *
 * ## Delayed start + pause (Phase 1)
 * When a delayed start is pending, `pauseAll` clears the timeout and stores the remaining
 * delay in `pendingStartRemainingMs`. `resumeAll` reschedules with that remaining time.
 *
 * ## Limitation
 * While globally paused, natural timer expiry is expressed only via saved remaining ms;
 * wall-clock drift between pause/resume is negligible for UX.
 */

import type { VibeExecutionLayer } from './player-engine.service';

// ── Internal state ────────────────────────────────────────────────────────────

interface ManagedLayer {
  soundId: number;
  layer: VibeExecutionLayer;
  audio: HTMLAudioElement | null;
  startTimerId: ReturnType<typeof setTimeout> | null;
  durationTimerId: ReturnType<typeof setTimeout> | null;
  /** Set while delayed-start timeout is scheduled (before audio exists). */
  startFiresAtEpochMs: number | null;
  /** Set while duration auto-stop timeout is scheduled. */
  durationFiresAtEpochMs: number | null;
  /** After pause interrupted a pending delayed start. */
  pendingStartRemainingMs: number | null;
  /** After pause interrupted an active duration countdown. */
  pendingDurationRemainingMs: number | null;
}

const _layers = new Map<number, ManagedLayer>();

/** True after pauseAll until resumeAll; cleared by stopAll / playPlan / restartPlan. */
let _sessionPaused = false;

/** Fired once when the last managed layer is removed (natural end, stopLayer, or stopAll). */
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _logPlayFailure(layer: VibeExecutionLayer, error: unknown): void {
  console.warn('[AudioPlayer] Failed to play layer', {
    soundId:   layer.soundId,
    soundName: layer.soundName,
    fileUrl:   layer.fileUrl,
    error,
  });
}

function _createAndPlay(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.pendingStartRemainingMs = null;

  const audio = new Audio(layer.fileUrl);
  audio.loop   = true;
  audio.volume = Math.max(0, Math.min(1, layer.volume / 100));
  managed.audio = audio;

  audio.play().catch((error) => _logPlayFailure(layer, error));

  if (layer.durationSeconds != null) {
    const durMs = layer.durationSeconds * 1_000;
    managed.durationFiresAtEpochMs = Date.now() + durMs;
    managed.durationTimerId = setTimeout(() => {
      managed.durationTimerId      = null;
      managed.durationFiresAtEpochMs = null;
      stopLayer(layer.soundId);
    }, durMs);
  }
}

function _enqueueLoopLayers(layers: VibeExecutionLayer[]): void {
  _sessionPaused = false;
  const loopLayers = layers.filter((l) => l.playMode === 'loop');
  for (const layer of loopLayers) {
    playLayer(layer);
  }
}

// ── Per-layer lifecycle ─────────────────────────────────────────────────────────

function playLayer(layer: VibeExecutionLayer): void {
  stopLayer(layer.soundId);

  const managed: ManagedLayer = {
    soundId:                  layer.soundId,
    layer,
    audio:                    null,
    startTimerId:             null,
    durationTimerId:          null,
    startFiresAtEpochMs:      null,
    durationFiresAtEpochMs:   null,
    pendingStartRemainingMs:  null,
    pendingDurationRemainingMs: null,
  };

  _layers.set(layer.soundId, managed);

  if (layer.startsAtSeconds > 0) {
    const delayMs = layer.startsAtSeconds * 1_000;
    managed.startFiresAtEpochMs = Date.now() + delayMs;
    managed.startTimerId = setTimeout(() => {
      managed.startTimerId        = null;
      managed.startFiresAtEpochMs = null;
      if (!_sessionPaused) {
        _createAndPlay(layer, managed);
      }
    }, delayMs);
  } else {
    _createAndPlay(layer, managed);
  }
}

function stopLayer(soundId: number): void {
  const managed = _layers.get(soundId);
  if (!managed) return;

  if (managed.startTimerId !== null) {
    clearTimeout(managed.startTimerId);
    managed.startTimerId = null;
  }

  if (managed.durationTimerId !== null) {
    clearTimeout(managed.durationTimerId);
    managed.durationTimerId = null;
  }

  managed.startFiresAtEpochMs      = null;
  managed.durationFiresAtEpochMs   = null;
  managed.pendingStartRemainingMs  = null;
  managed.pendingDurationRemainingMs = null;

  if (managed.audio !== null) {
    managed.audio.pause();
    managed.audio.currentTime = 0;
    managed.audio.src = '';
    managed.audio = null;
  }

  _layers.delete(soundId);
  _notifySessionEndedIfEmpty();
}

// ── Session API ─────────────────────────────────────────────────────────────────

function playPlan(layers: VibeExecutionLayer[]): void {
  stopAll();
  _enqueueLoopLayers(layers);
}

/** Same effect as playPlan in Phase 1 (explicit API for callers). */
function restartPlan(layers: VibeExecutionLayer[]): void {
  stopAll();
  _enqueueLoopLayers(layers);
}

function pauseAll(): void {
  if (!_layers.size) return;

  _sessionPaused = true;

  for (const managed of _layers.values()) {
    if (managed.startTimerId !== null) {
      clearTimeout(managed.startTimerId);
      managed.startTimerId = null;
      if (managed.startFiresAtEpochMs !== null) {
        managed.pendingStartRemainingMs = Math.max(0, managed.startFiresAtEpochMs - Date.now());
        managed.startFiresAtEpochMs     = null;
      }
    }

    if (managed.durationTimerId !== null) {
      clearTimeout(managed.durationTimerId);
      managed.durationTimerId = null;
      if (managed.durationFiresAtEpochMs !== null) {
        managed.pendingDurationRemainingMs = Math.max(0, managed.durationFiresAtEpochMs - Date.now());
        managed.durationFiresAtEpochMs     = null;
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
    if (managed.audio !== null) {
      const rem = managed.pendingDurationRemainingMs;
      managed.pendingDurationRemainingMs = null;

      if (rem !== null && rem > 0) {
        managed.durationFiresAtEpochMs = Date.now() + rem;
        managed.durationTimerId = setTimeout(() => {
          managed.durationTimerId        = null;
          managed.durationFiresAtEpochMs = null;
          stopLayer(managed.soundId);
        }, rem);
      }

      managed.audio.play().catch((error) => _logPlayFailure(managed.layer, error));
    } else {
      const remStart = managed.pendingStartRemainingMs;
      managed.pendingStartRemainingMs = null;

      if (remStart !== null && remStart > 0) {
        managed.startFiresAtEpochMs = Date.now() + remStart;
        managed.startTimerId = setTimeout(() => {
          managed.startTimerId        = null;
          managed.startFiresAtEpochMs = null;
          if (!_sessionPaused) {
            _createAndPlay(managed.layer, managed);
          }
        }, remStart);
      } else if (remStart !== null && remStart <= 0) {
        if (!_sessionPaused) {
          _createAndPlay(managed.layer, managed);
        }
      }
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
