/**
 * useAudioPlayer — Phase 1
 *
 * Thin reactive wrapper around audioPlayerService.
 * Owns only: isPlaying reactive ref.
 * All timer and audio-element management lives in audio-player.service.ts.
 *
 * Phase 1 scope: loop layers only.
 * Intentionally ignores: interval, once, fade in/out, background audio.
 */

import { ref } from 'vue';
import { audioPlayerService } from '@/services/audio-player.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

const isPlaying = ref(false);

/**
 * Start playback for all loop layers in the execution plan.
 * Any previously managed audio and timers are stopped first.
 */
function playPlan(layers: VibeExecutionLayer[]): void {
  audioPlayerService.stopAll();

  const loopLayers = layers.filter((l) => l.playMode === 'loop');
  if (!loopLayers.length) return;

  loopLayers.forEach((layer) => audioPlayerService.playLayer(layer));

  isPlaying.value = true;
}

/**
 * Stop a single layer (and its timers).
 * Updates isPlaying to false if no layers remain active.
 */
function stopLayer(soundId: number): void {
  audioPlayerService.stopLayer(soundId);

  if (!audioPlayerService.hasActiveLayers()) {
    isPlaying.value = false;
  }
}

/**
 * Stop ALL active layers and timers.
 */
function stopAll(): void {
  audioPlayerService.stopAll();
  isPlaying.value = false;
}

export function useAudioPlayer() {
  return { isPlaying, playPlan, stopLayer, stopAll };
}
