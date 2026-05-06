/**
 * useAudioPlayer — Phase 3 (loop + once + interval + fades + mini player context)
 *
 * Module-level singletons shared across every useAudioPlayer() call-site.
 * currentVibeId / currentVibeName / currentSoundSummary drive the MiniPlayer.
 * setCurrentVibe() is called by VibePlayerPage when playback starts.
 * clearCurrentVibe() is called on explicit stop and on session-ended callback.
 */

import { ref } from 'vue';
import {
  audioPlayerService,
  setSessionEndedCallback,
} from '@/services/audio-player.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

export type PlaybackState = 'idle' | 'playing' | 'paused';

const playbackState = ref<PlaybackState>('idle');

// ── Vibe context (drives MiniPlayer) ─────────────────────────────────────────

/** The id of the vibe whose audio is currently active. Null when idle. */
const currentVibeId = ref<number | null>(null);

/** Display name of the currently-playing vibe. */
const currentVibeName = ref<string>('');

/**
 * Brief sound count string (e.g. "3 sounds") shown in the mini player.
 * VibePlayerPage sets this when playback starts.
 */
const currentSoundSummary = ref<string>('');

function setCurrentVibe(id: number, name: string, soundSummary: string): void {
  currentVibeId.value    = id;
  currentVibeName.value  = name;
  currentSoundSummary.value = soundSummary;
}

function clearCurrentVibe(): void {
  currentVibeId.value       = null;
  currentVibeName.value     = '';
  currentSoundSummary.value = '';
}

/** Wall-clock session elapsed (1 Hz); paused freezes increments via clearInterval. */
const elapsedSeconds = ref(0);
let timerRef: ReturnType<typeof setInterval> | null = null;

function syncFromService(): void {
  if (!audioPlayerService.hasActiveLayers()) {
    playbackState.value = 'idle';
    return;
  }
  playbackState.value = audioPlayerService.isSessionPaused() ? 'paused' : 'playing';
}

function clearTimer(): void {
  if (timerRef) {
    clearInterval(timerRef);
    timerRef = null;
  }
}

/** Start / resume interval ticks without resetting elapsed. */
function startElapsedTicker(): void {
  clearTimer();
  timerRef = setInterval(() => {
    elapsedSeconds.value++;
  }, 1_000);
}

/** Freeze elapsed ticker — preserves elapsedSeconds. */
function pauseElapsedTicker(): void {
  clearTimer();
}

function resetElapsed(): void {
  elapsedSeconds.value = 0;
  clearTimer();
}

/** Fresh session: elapsed → 0 and ticker starts. */
function beginSessionClock(): void {
  elapsedSeconds.value = 0;
  startElapsedTicker();
}

/** After pause: continue ticking from current elapsed. */
function resumeElapsedTicker(): void {
  startElapsedTicker();
}

// When every audio layer ends (duration expiry / teardown), snap UI to Ready.
setSessionEndedCallback(() => {
  playbackState.value = 'idle';
  resetElapsed();
  clearCurrentVibe();
});

function playPlan(layers: VibeExecutionLayer[]): boolean {
  audioPlayerService.playPlan(layers);
  syncFromService();
  return audioPlayerService.hasActiveLayers();
}

function pauseAll(): void {
  audioPlayerService.pauseAll();
  syncFromService();
}

function resumeAll(): void {
  audioPlayerService.resumeAll();
  syncFromService();
}

function stopAll(): void {
  audioPlayerService.stopAll();
  playbackState.value = 'idle';
  resetElapsed();
  clearCurrentVibe();
}

function restartPlan(layers: VibeExecutionLayer[]): boolean {
  audioPlayerService.restartPlan(layers);
  syncFromService();
  return audioPlayerService.hasActiveLayers();
}

export function useAudioPlayer() {
  return {
    // ── Playback state ──────────────────────────────────────
    playbackState,
    elapsedSeconds,
    playPlan,
    pauseAll,
    resumeAll,
    stopAll,
    restartPlan,
    beginSessionClock,
    pauseElapsedTicker,
    resumeElapsedTicker,
    resetElapsed,

    // ── Vibe context for MiniPlayer ─────────────────────────
    currentVibeId,
    currentVibeName,
    currentSoundSummary,
    setCurrentVibe,
    clearCurrentVibe,
  };
}
