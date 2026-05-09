/**
 * player.store.ts — Global player state (Pinia)
 *
 * This is the single source of truth for all reactive UI state related to
 * audio playback. Components (VibePlayerPage, MiniPlayer, TabsLayout) and
 * composables (useAppLifecycleAudio) read state and call actions from here.
 *
 * ## Separation of concerns
 * - audio-player.service.ts  → audio runtime (native/HTML elements, timers, layers)
 * - player.store.ts          → reactive UI state (playbackState, vibe context, elapsed)
 *
 * ## Session-ended callback
 * The store registers a single callback with the audio service so that when
 * every layer finishes naturally (duration expiry), the store snaps to idle
 * without any component needing to do it explicitly.
 *
 * ## Elapsed clock
 * A plain setInterval drives elapsedSeconds. It lives outside Pinia's reactive
 * tree so Pinia doesn't need to track the timer reference itself.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

import {
  audioPlayerService,
  setSessionEndedCallback,
} from '@/services/audio-player.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

export type PlaybackState = 'idle' | 'playing' | 'paused';

// Non-reactive timer ref — lives outside the store so Pinia never wraps it.
let _timerRef: ReturnType<typeof setInterval> | null = null;

export const usePlayerStore = defineStore('player', () => {

  // ── Reactive state ─────────────────────────────────────────────────────────

  const playbackState       = ref<PlaybackState>('idle');
  const currentVibeId       = ref<number | null>(null);
  const currentVibeName     = ref<string>('');
  const currentSoundSummary = ref<string>('');
  const elapsedSeconds      = ref(0);
  /**
   * Mirrors audioPlayerService.hasActiveLayers().
   * Updated synchronously after every play/pause/stop action so components
   * never need to call the service directly.
   */
  const hasActiveLayers     = ref(false);

  // ── Elapsed clock ──────────────────────────────────────────────────────────

  function _clearTimer(): void {
    if (_timerRef) {
      clearInterval(_timerRef);
      _timerRef = null;
    }
  }

  function _startTicker(): void {
    _clearTimer();
    _timerRef = setInterval(() => { elapsedSeconds.value++; }, 1_000);
  }

  function beginSessionClock(): void {
    elapsedSeconds.value = 0;
    _startTicker();
  }

  function pauseElapsedTicker(): void { _clearTimer(); }

  function resumeElapsedTicker(): void { _startTicker(); }

  function resetElapsed(): void {
    _clearTimer();
    elapsedSeconds.value = 0;
  }

  // ── Vibe context ───────────────────────────────────────────────────────────

  function setCurrentVibe(id: number, name: string, soundSummary: string): void {
    currentVibeId.value       = id;
    currentVibeName.value     = name;
    currentSoundSummary.value = soundSummary;
  }

  function clearCurrentVibe(): void {
    currentVibeId.value       = null;
    currentVibeName.value     = '';
    currentSoundSummary.value = '';
  }

  // ── Session-ended callback ─────────────────────────────────────────────────
  // Registered once at store creation time. The audio service calls this when
  // all layers finish naturally (duration timers) so the UI snaps to idle.

  setSessionEndedCallback(() => {
    playbackState.value   = 'idle';
    hasActiveLayers.value = false;
    resetElapsed();
    clearCurrentVibe();
  });

  // ── Playback actions ───────────────────────────────────────────────────────

  /**
   * Start a new playback session from an execution plan.
   * Returns true if at least one layer passes validation.
   *
   * Callers must call setCurrentVibe() BEFORE this so the vibe context is
   * visible to the Mini Player from the very first reactive flush.
   *
   * ## Optimistic update
   * State is set to 'playing' / hasActiveLayers = true BEFORE calling the
   * audio service, based on the count of valid layers in the input. This is
   * critical for native loop layers: preload + loop are async (fire-and-forget)
   * so the service's hasActiveLayers() would still return true, but the
   * _scheduleLayerLifetime timer (especially when fadeStartDelayMs = 0) can
   * fire on the very next event-loop tick and destroy the layer before Vue
   * has a chance to render the 'playing' state.
   * By committing the state before the service runs, the first reactive flush
   * always shows the correct state.
   * If all layers fail validation inside the service, _sessionEndedCallback
   * will fire synchronously and reset everything to 'idle' correctly.
   */
  function playPlan(layers: VibeExecutionLayer[]): boolean {
    const valid = audioPlayerService.countValidLayers(layers);
    if (valid === 0) return false;

    // Optimistic update: commit playing state before starting the audio engine.
    hasActiveLayers.value = true;
    playbackState.value   = 'playing';

    audioPlayerService.playPlan(layers);
    return true;
  }

  function pausePlayback(): void {
    audioPlayerService.pauseAll();
    if (audioPlayerService.hasActiveLayers()) {
      playbackState.value = 'paused';
    }
    pauseElapsedTicker();
  }

  function resumePlayback(): void {
    audioPlayerService.resumeAll();
    if (audioPlayerService.hasActiveLayers()) {
      playbackState.value = 'playing';
    }
    resumeElapsedTicker();
  }

  function stopPlayback(): void {
    audioPlayerService.stopAll();
    playbackState.value   = 'idle';
    hasActiveLayers.value = false;
    resetElapsed();
    clearCurrentVibe();
  }

  /**
   * Restart playback from the beginning without changing vibe context.
   * Returns true if at least one layer passes validation.
   */
  function restartPlayback(layers: VibeExecutionLayer[]): boolean {
    const valid = audioPlayerService.countValidLayers(layers);
    if (valid === 0) return false;

    hasActiveLayers.value = true;
    playbackState.value   = 'playing';

    audioPlayerService.restartPlan(layers);
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // state (reactive refs — use storeToRefs() in components)
    playbackState,
    currentVibeId,
    currentVibeName,
    currentSoundSummary,
    elapsedSeconds,
    hasActiveLayers,

    // elapsed clock
    beginSessionClock,
    pauseElapsedTicker,
    resumeElapsedTicker,
    resetElapsed,

    // vibe context
    setCurrentVibe,
    clearCurrentVibe,

    // playback
    playPlan,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    restartPlayback,
  };
});
