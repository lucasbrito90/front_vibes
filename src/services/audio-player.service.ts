/**
 * audio-player.service.ts — Phase 1
 *
 * Pure imperative service that manages HTMLAudioElement instances and their
 * associated timers per sound layer. Intentionally does not know about Vue
 * reactivity — all reactive state lives in useAudioPlayer.ts.
 *
 * Phase 1 scope: loop layers only.
 * Timers are tracked for:
 *   - delayed start  (startsAtSeconds > 0)
 *   - auto-stop      (durationSeconds != null, even for loop layers)
 */

import type { VibeExecutionLayer } from './player-engine.service';

// ── Internal state ────────────────────────────────────────────────────────────

interface ManagedLayer {
  soundId: number;
  /** Null while the start is still pending (delayed by startsAtSeconds). */
  audio: HTMLAudioElement | null;
  /** setTimeout ID for the delayed start; null when already started. */
  startTimerId: ReturnType<typeof setTimeout> | null;
  /** setTimeout ID for the auto-stop after durationSeconds; null if no limit. */
  durationTimerId: ReturnType<typeof setTimeout> | null;
}

/** One entry per active or pending layer, keyed by soundId. */
const _layers = new Map<number, ManagedLayer>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function _createAndPlay(layer: VibeExecutionLayer, managed: ManagedLayer): void {
  managed.startTimerId = null;

  const audio = new Audio(layer.fileUrl);
  audio.loop   = true;
  audio.volume = Math.max(0, Math.min(1, layer.volume / 100));
  managed.audio = audio;

  audio.play().catch((error) => {
    console.warn('[AudioPlayer] Failed to play layer', {
      soundId:   layer.soundId,
      soundName: layer.soundName,
      fileUrl:   layer.fileUrl,
      error,
    });
  });

  // Schedule auto-stop if the layer has a finite duration
  if (layer.durationSeconds != null) {
    managed.durationTimerId = setTimeout(() => {
      stopLayer(layer.soundId);
    }, layer.durationSeconds * 1_000);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start (or schedule) playback for a single layer.
 * If a layer with the same soundId is already managed, it is stopped first.
 */
function playLayer(layer: VibeExecutionLayer): void {
  // Prevent duplicate layers for the same sound
  stopLayer(layer.soundId);

  const managed: ManagedLayer = {
    soundId:         layer.soundId,
    audio:           null,
    startTimerId:    null,
    durationTimerId: null,
  };

  _layers.set(layer.soundId, managed);

  if (layer.startsAtSeconds > 0) {
    // Delayed start — timer reference is stored so stopLayer can cancel it
    managed.startTimerId = setTimeout(
      () => _createAndPlay(layer, managed),
      layer.startsAtSeconds * 1_000,
    );
  } else {
    _createAndPlay(layer, managed);
  }
}

/**
 * Stop a specific layer and clear ALL its associated timers.
 * Safe to call even if the soundId is not currently managed.
 *
 * This is the single place where timer cleanup happens — both stopLayer
 * and stopAll go through here.
 */
function stopLayer(soundId: number): void {
  const managed = _layers.get(soundId);
  if (!managed) return;

  // Cancel pending delayed-start timer so audio never starts later
  if (managed.startTimerId !== null) {
    clearTimeout(managed.startTimerId);
    managed.startTimerId = null;
  }

  // Cancel pending auto-stop timer
  if (managed.durationTimerId !== null) {
    clearTimeout(managed.durationTimerId);
    managed.durationTimerId = null;
  }

  // Stop and release the audio element (if it was already created)
  if (managed.audio !== null) {
    managed.audio.pause();
    managed.audio.src = ''; // allow GC and cancel any in-flight network request
    managed.audio = null;
  }

  _layers.delete(soundId);
}

/**
 * Stop ALL active/pending layers and clear every timer.
 * After this call the internal map is empty and no audio will ever start.
 */
function stopAll(): void {
  // Copy keys before iterating — stopLayer mutates the map
  for (const soundId of [..._layers.keys()]) {
    stopLayer(soundId);
  }
}

/** True if at least one layer is active or pending. */
function hasActiveLayers(): boolean {
  return _layers.size > 0;
}

export const audioPlayerService = {
  playLayer,
  stopLayer,
  stopAll,
  hasActiveLayers,
};
