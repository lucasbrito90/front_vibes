/**
 * useAudioPlayer — Phase 1
 *
 * Plays only "loop" layers from an execution plan using HTMLAudioElement.
 * Intentionally ignores: interval, once, fade in/out, background audio.
 * Module-level singleton: only one vibe plays at a time.
 */

import { ref } from 'vue';
import type { VibeExecutionLayer } from '@/services/player-engine.service';

const isPlaying = ref(false);

// Active audio elements — managed explicitly so we can stop them
const _elements: HTMLAudioElement[] = [];

/**
 * Start playback for all loop layers in the given execution plan.
 * Any previously playing audio is stopped first.
 */
function playPlan(layers: VibeExecutionLayer[]): void {
  stopAll();

  const loopLayers = layers.filter((l) => l.playMode === 'loop');
  if (!loopLayers.length) return;

  loopLayers.forEach((layer) => {
    const audio = new Audio(layer.fileUrl);
    audio.loop    = true;
    audio.volume  = Math.max(0, Math.min(1, layer.volume / 100));

    audio.play().catch((err) =>
      // File URL may be a placeholder in Phase 1 — silently log, do not throw
      console.warn(`[audio-player] Could not play "${layer.soundName}":`, err),
    );

    _elements.push(audio);
  });

  isPlaying.value = true;
}

/**
 * Stop all active audio and release resources.
 */
function stopAll(): void {
  _elements.forEach((audio) => {
    audio.pause();
    audio.src = ''; // trigger GC / release network request
  });
  _elements.length = 0;
  isPlaying.value = false;
}

export function useAudioPlayer() {
  return { isPlaying, playPlan, stopAll };
}
