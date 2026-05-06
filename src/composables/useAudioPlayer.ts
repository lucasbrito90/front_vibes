/**
 * useAudioPlayer — Phase 2 (loop + once + interval)
 *
 * Reactive playback state + session timer helpers around audioPlayerService.
 */

import { ref } from 'vue';
import {
  audioPlayerService,
  setSessionEndedCallback,
} from '@/services/audio-player.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

export type PlaybackState = 'idle' | 'playing' | 'paused';

const playbackState = ref<PlaybackState>('idle');

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
}

function restartPlan(layers: VibeExecutionLayer[]): boolean {
  audioPlayerService.restartPlan(layers);
  syncFromService();
  return audioPlayerService.hasActiveLayers();
}

export function useAudioPlayer() {
  return {
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
  };
}
