/**
 * useAudioPlayer — legacy composable (kept for backward compatibility)
 *
 * This composable has been superseded by `usePlayerStore` (Pinia).
 * All components should migrate to importing `usePlayerStore` directly.
 *
 * The composable is intentionally kept as a thin re-export of the Pinia store
 * so that any remaining references compile without errors while the migration
 * is in progress.
 *
 * @deprecated Use `usePlayerStore` from `@/stores/player.store` instead.
 */

import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player.store';

export type { PlaybackState } from '@/stores/player.store';

export function useAudioPlayer() {
  const store = usePlayerStore();
  const {
    playbackState,
    elapsedSeconds,
    hasActiveLayers,
    currentVibeId,
    currentVibeName,
    currentSoundSummary,
  } = storeToRefs(store);

  return {
    // state
    playbackState,
    elapsedSeconds,
    hasActiveLayers,
    currentVibeId,
    currentVibeName,
    currentSoundSummary,

    // actions
    playPlan:          store.playPlan,
    pauseAll:          store.pausePlayback,
    resumeAll:         store.resumePlayback,
    stopAll:           store.stopPlayback,
    restartPlan:       store.restartPlayback,
    beginSessionClock: store.beginSessionClock,
    pauseElapsedTicker: store.pauseElapsedTicker,
    resumeElapsedTicker: store.resumeElapsedTicker,
    resetElapsed:      store.resetElapsed,
    setCurrentVibe:    store.setCurrentVibe,
    clearCurrentVibe:  store.clearCurrentVibe,
  };
}
