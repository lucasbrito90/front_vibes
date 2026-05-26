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
import { computed, ref } from 'vue';
import { toastController } from '@ionic/vue';

import {
  audioPlayerService,
  setSessionEndedCallback,
  setMediaControlCallbacks,
  setPlaybackPrepareCallbacks,
  setNotificationVibeName,
  setNotificationArtworkUrl,
} from '@/services/audio-player.service';
import { setAudioFocusCallbacks } from '@/services/audio-focus.service';
import {
  startBackgroundAudio,
  stopBackgroundAudio,
  updateBackgroundAudioTitle,
} from '@/services/backgroundAudio.service';
import type { VibeExecutionLayer } from '@/services/player-engine.service';
import { audioEngine } from '@/services/audio-engine';
import type { CacheVibeResult } from '@/services/audio-engine';
import { logCdnAssetDev } from '@/utils/cdn-assets-dev-log';
import { createLogger } from '@/utils/player-debug';

export type PlaybackState = 'idle' | 'preparing' | 'playing' | 'paused' | 'error';

const log = createLogger('PlayerStore');
const uxLog = createLogger('PlayerUX');

/** Spec: inline error UX (~2.4s) before returning to idle. Cleared on retry/stop/new play. */
const PLAYBACK_ERROR_IDLE_MS = 2_400;

// Non-reactive timer ref — lives outside the store so Pinia never wraps it.
let _timerRef: ReturnType<typeof setInterval> | null = null;
let _playbackErrorResetTimer: number | null = null;

/** Logs a state transition in [old → new] format. */
function _logTransition(field: string, from: unknown, to: unknown): void {
  log.debug(`${field} ${String(from)} → ${String(to)}`);
}

export const usePlayerStore = defineStore('player', () => {

  // ── Reactive state ─────────────────────────────────────────────────────────

  const playbackState        = ref<PlaybackState>('idle');
  const currentVibeId        = ref<number | null>(null);
  const currentVibeName      = ref<string>('');
  const currentSoundSummary  = ref<string>('');
  const currentVibeArtworkUrl = ref<string | null>(null);
  const elapsedSeconds       = ref(0);
  /**
   * Mirrors audioPlayerService.hasActiveLayers().
   * Updated synchronously after every play/pause/stop action so components
   * never need to call the service directly.
   */
  const hasActiveLayers      = ref(false);

  /**
   * MiniPlayer represents an audible session only (playing/paused).
   * Preparing and error keep vibe context on the full player page but must
   * not surface a mini-player bar.
   */
  const showMiniPlayer = computed(
    () =>
      currentVibeId.value !== null
      && (playbackState.value === 'playing' || playbackState.value === 'paused'),
  );

  function _syncHasActiveLayersFromService(): void {
    hasActiveLayers.value = audioPlayerService.hasActiveLayers();
  }

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
    log.debug('session clock started');
  }

  function pauseElapsedTicker(): void { _clearTimer(); }

  function resumeElapsedTicker(): void { _startTicker(); }

  function resetElapsed(): void {
    _clearTimer();
    elapsedSeconds.value = 0;
  }

  function _clearPlaybackErrorResetTimer(): void {
    if (_playbackErrorResetTimer != null) {
      clearTimeout(_playbackErrorResetTimer);
      _playbackErrorResetTimer = null;
    }
  }

  /**
   * After prepare failure, keep `error` + vibe context for inline player UX,
   * then return to idle per playback-runtime spec (~2.4s).
   */
  function _schedulePlaybackErrorIdleReset(): void {
    _clearPlaybackErrorResetTimer();
    _playbackErrorResetTimer = window.setTimeout(() => {
      _playbackErrorResetTimer = null;
      if (playbackState.value !== 'error') return;
      _logTransition('playbackState', 'error', 'idle');
      playbackState.value = 'idle';
      clearCurrentVibe();
      setNotificationVibeName('');
      setNotificationArtworkUrl(null);
    }, PLAYBACK_ERROR_IDLE_MS);
  }

  function _enterPlaybackErrorState(): void {
    const prev = playbackState.value;
    playbackState.value   = 'error';
    hasActiveLayers.value = false;
    if (prev !== 'error') _logTransition('playbackState', prev, 'error');
    resetElapsed();
    // Keep currentVibe* until idle reset so VibePlayerPage can render inline retry.
    setNotificationVibeName('');
    setNotificationArtworkUrl(null);
    void stopBackgroundAudio();
    _schedulePlaybackErrorIdleReset();

    void (async () => {
      const toast = await toastController.create({
        message:  'Unable to start playback. Check your connection and try again.',
        duration: 3_000,
        position: 'bottom',
        color:    'danger',
      });
      await toast.present();
    })();
  }

  // ── Vibe context ───────────────────────────────────────────────────────────

  function setCurrentVibe(
    id: number,
    name: string,
    soundSummary: string,
    artworkUrl?: string | null,
  ): void {
    log.debug('setCurrentVibe', { id, name, soundSummary, hasArtwork: !!artworkUrl });
    currentVibeId.value         = id;
    currentVibeName.value       = name;
    currentSoundSummary.value   = soundSummary;
    currentVibeArtworkUrl.value = artworkUrl ?? null;
    audioPlayerService.setPlaybackVibeContext(id);
  }

  function clearCurrentVibe(): void {
    log.debug('clearCurrentVibe');
    audioPlayerService.setPlaybackVibeContext(null);
    currentVibeId.value         = null;
    currentVibeName.value       = '';
    currentSoundSummary.value   = '';
    currentVibeArtworkUrl.value = null;
  }

  // ── Session-ended callback ─────────────────────────────────────────────────
  // Registered once at store creation time. The audio service calls this when
  // all layers finish naturally (duration timers) so the UI snaps to idle.

  setSessionEndedCallback(() => {
    log.debug('sessionEnded callback fired', {
      playbackState: playbackState.value,
      currentVibeId: currentVibeId.value,
      svcHasActive:  audioPlayerService.hasActiveLayers(),
    });

    // Prepare failure and inline error UX own the lifecycle — do not snap to idle early.
    if (playbackState.value === 'preparing' || playbackState.value === 'error') {
      log.debug('sessionEnded ignored — prepare/error lifecycle active');
      hasActiveLayers.value = audioPlayerService.hasActiveLayers();
      return;
    }

    const prev = playbackState.value;
    playbackState.value   = 'idle';
    hasActiveLayers.value = false;
    if (prev !== 'idle') _logTransition('playbackState', prev, 'idle');
    resetElapsed();
    clearCurrentVibe();
    // All layers ended naturally — stop the foreground service.
    void stopBackgroundAudio();
  });

  /** Prepare handshake — transition to playing only after Native/HTML confirms audible start. */
  setPlaybackPrepareCallbacks({
    onPrepared() {
      if (playbackState.value !== 'preparing') {
        if (import.meta.env.DEV) {
          console.log('[PlaybackState] onPrepared ignored (not preparing)', {
            state: playbackState.value,
          });
        }
        return;
      }
      const prev = playbackState.value;
      playbackState.value = 'playing';
      _logTransition('playbackState', prev, 'playing');
      _syncHasActiveLayersFromService();
      beginSessionClock();
      void startBackgroundAudio(currentVibeName.value).catch(() => undefined);
      if (import.meta.env.DEV) uxLog.debug('[PlayerUX] preparing → playing');
    },
    onFailed() {
      if (playbackState.value !== 'preparing') return;

      if (import.meta.env.DEV) {
        console.warn('[PlaybackState] prepare failed — entering error state');
        uxLog.warn('[PlayerUX] playback prepare failed', {
          vibeId: currentVibeId.value,
          svcLayers: audioPlayerService.hasActiveLayers(),
        });
      }

      audioPlayerService.stopAll();
      _enterPlaybackErrorState();
    },
  });

  // ── Media control callbacks ────────────────────────────────────────────────
  // NativeAudio fires 'playbackState' events with reason='remotePlay/Pause/Stop'
  // when the user taps lock-screen or notification media controls. The audio
  // service dispatches these to the callbacks registered here so Pinia (and
  // therefore the MiniPlayer and VibePlayerPage) stays in sync.

  setMediaControlCallbacks({
    onPlay() {
      log.debug('[MediaSession] remote play received');
      if (playbackState.value === 'preparing') return;
      if (playbackState.value === 'paused') resumePlayback();
    },
    onPause() {
      log.debug('[MediaSession] remote pause received');
      if (playbackState.value === 'preparing') return;
      if (playbackState.value === 'playing') pausePlayback();
    },
    onStop() {
      log.debug('[MediaSession] remote stop received');
      if (playbackState.value !== 'idle') stopPlayback();
    },
  });

  // Register headset disconnect callback. The audio-focus.service bridges
  // Android's ACTION_AUDIO_BECOMING_NOISY to this action so that pulling out
  // headphones or disconnecting Bluetooth pauses playback immediately.
  setAudioFocusCallbacks({
    onBecomingNoisy() {
      log.debug('[AudioFocus] headset/BT disconnected — pausing');
      if (playbackState.value === 'preparing') return;
      if (playbackState.value === 'playing') pausePlayback();
    },
  });

  // ── Playback actions ───────────────────────────────────────────────────────

  /**
   * Primary entry point for starting any vibe. Combines setCurrentVibe +
   * optimistic state update + session clock + audioPlayerService.playPlan()
   * into a single atomic action so Pinia is ALWAYS in sync with the audio
   * backend — regardless of whether NativeAudio or HTMLAudio is used.
   *
   * If another vibe is already playing it is stopped automatically (the audio
   * service's playPlan() calls stopAll() internally under _playPlanInProgress).
   *
   * Returns true if at least one layer passes validation.
   */
  function playVibe(params: {
    vibeId: number;
    vibeName: string;
    soundSummary: string;
    artworkUrl?: string | null;
    layers: VibeExecutionLayer[];
  }): boolean {
    const { vibeId: id, vibeName, soundSummary, artworkUrl, layers } = params;
    logCdnAssetDev('artwork', artworkUrl ?? null);
    const valid = audioPlayerService.countValidLayers(layers);

    log.debug('playVibe', {
      vibeId:        id,
      validLayers:   valid,
      currentVibeId: currentVibeId.value,
      playbackState: playbackState.value,
    });

    if (valid === 0) {
      log.warn('playVibe — no valid layers, aborting');
      return false;
    }

    _clearPlaybackErrorResetTimer();
    resetElapsed();

    // Set vibe context BEFORE audio engine starts so the full player page can
    // show per-vibe preparing/error UX. MiniPlayer only appears after audible start.
    setCurrentVibe(id, vibeName, soundSummary, artworkUrl);

    // Push vibe name + artwork to audio service so every upcoming
    // NativeAudio.preload() embeds them in the MediaSession notification.
    setNotificationVibeName(vibeName);
    setNotificationArtworkUrl(artworkUrl ?? null);

    const prevState = playbackState.value;
    playbackState.value = 'preparing';
    if (prevState !== 'preparing') _logTransition('playbackState', prevState, 'preparing');

    // Hand off to the audio engine. playPlan() stops any previous session
    // first (under _playPlanInProgress guard), then registers new layers.
    log.debug('playVibe — calling audioPlayerService.playPlan()', { valid });
    audioPlayerService.playPlan(layers);
    _syncHasActiveLayersFromService();

    log.debug('playVibe — done', {
      svcHasActive:  audioPlayerService.hasActiveLayers(),
      storeHasActive: hasActiveLayers.value,
    });

    return true;
  }

  /**
   * Low-level plan runner — kept for internal use and backward compatibility.
   * Prefer playVibe() for all new call sites: it sets vibe context and starts
   * the elapsed clock in addition to running the plan.
   */
  function playPlan(layers: VibeExecutionLayer[]): boolean {
    const valid = audioPlayerService.countValidLayers(layers);
    log.debug('playPlan called', {
      totalLayers:   layers.length,
      validLayers:   valid,
      currentVibeId: currentVibeId.value,
      playbackState: playbackState.value,
    });

    if (valid === 0) {
      log.warn('playPlan — no valid layers, aborting');
      return false;
    }

    _clearPlaybackErrorResetTimer();
    resetElapsed();

    const prevState = playbackState.value;
    playbackState.value = 'preparing';
    if (prevState !== 'preparing') _logTransition('playbackState', prevState, 'preparing');

    audioPlayerService.setPlaybackVibeContext(currentVibeId.value);
    log.debug('playPlan — calling audioPlayerService.playPlan()', { valid });
    audioPlayerService.playPlan(layers);
    _syncHasActiveLayersFromService();

    log.debug('playPlan — done', {
      svcHasActive:  audioPlayerService.hasActiveLayers(),
      storeHasActive: hasActiveLayers.value,
    });
    return true;
  }

  function pausePlayback(): void {
    log.debug('pausePlayback', {
      playbackState: playbackState.value,
      svcHasActive:  audioPlayerService.hasActiveLayers(),
    });
    if (playbackState.value === 'preparing') return;
    audioPlayerService.pauseAll();
    if (audioPlayerService.hasActiveLayers()) {
      const prev = playbackState.value;
      playbackState.value = 'paused';
      if (prev !== 'paused') _logTransition('playbackState', prev, 'paused');
      _syncHasActiveLayersFromService();
    }
    pauseElapsedTicker();
  }

  function resumePlayback(): void {
    log.debug('resumePlayback', {
      playbackState: playbackState.value,
      svcHasActive:  audioPlayerService.hasActiveLayers(),
    });
    if (playbackState.value === 'preparing') return;
    audioPlayerService.resumeAll();
    if (audioPlayerService.hasActiveLayers()) {
      const prev = playbackState.value;
      playbackState.value = 'playing';
      if (prev !== 'playing') _logTransition('playbackState', prev, 'playing');
      _syncHasActiveLayersFromService();
    }
    resumeElapsedTicker();
  }

  function stopPlayback(): void {
    log.debug('stopPlayback', {
      playbackState: playbackState.value,
      currentVibeId: currentVibeId.value,
      svcHasActive:  audioPlayerService.hasActiveLayers(),
    });
    _clearPlaybackErrorResetTimer();
    audioPlayerService.stopAll();
    const prev = playbackState.value;
    playbackState.value   = 'idle';
    hasActiveLayers.value = false;
    if (prev !== 'idle') _logTransition('playbackState', prev, 'idle');
    resetElapsed();
    clearCurrentVibe();
    setNotificationVibeName('');
    setNotificationArtworkUrl(null);
    // User explicitly stopped — stop the foreground service.
    void stopBackgroundAudio();
  }

  /**
   * Restart playback from the beginning without changing vibe context.
   * Returns true if at least one layer passes validation.
   */
  function restartPlayback(layers: VibeExecutionLayer[]): boolean {
    const valid = audioPlayerService.countValidLayers(layers);
    log.debug('restartPlayback', {
      totalLayers:   layers.length,
      validLayers:   valid,
      currentVibeId: currentVibeId.value,
    });

    if (valid === 0) {
      log.warn('restartPlayback — no valid layers, aborting');
      return false;
    }

    _clearPlaybackErrorResetTimer();
    resetElapsed();

    const prevState = playbackState.value;
    playbackState.value = 'preparing';
    if (prevState !== 'preparing') _logTransition('playbackState', prevState, 'preparing');

    audioPlayerService.setPlaybackVibeContext(currentVibeId.value);
    log.debug('restartPlayback — calling audioPlayerService.restartPlan()', { valid });
    audioPlayerService.restartPlan(layers);
    _syncHasActiveLayersFromService();
    return true;
  }

  /**
   * Update the foreground service notification with the current vibe name.
   * Call this if vibe metadata changes while playback continues.
   */
  function syncBackgroundAudioTitle(): void {
    void updateBackgroundAudioTitle(currentVibeName.value).catch(() => undefined);
  }

  // ── Cache management ───────────────────────────────────────────────────────

  /**
   * Clear the audio disk cache.
   *
   * Delegates to AudioEngine.clearAudioCache() which releases the ExoPlayer
   * SimpleCache and deletes getCacheDir()/media. Safe to call when idle.
   * Should not be called during active playback.
   */
  async function clearAudioCache(): Promise<void> {
    await audioEngine.clearAudioCache();
  }

  /**
   * Warm the ExoPlayer disk cache for a vibe's layers without starting playback.
   * Each eligible layer (remote HTTPS URL) is preloaded and immediately unloaded
   * so that cached bytes are available for subsequent plays.
   *
   * @param vibeId - The vibe being cached (used in cache-only assetId namespace)
   * @param layers - Execution layers to warm
   */
  async function cacheVibeAudio(vibeId: number, layers: VibeExecutionLayer[]): Promise<CacheVibeResult> {
    return audioEngine.cacheVibeAudio(vibeId, layers);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // state (reactive refs — use storeToRefs() in components)
    playbackState,
    currentVibeId,
    currentVibeName,
    currentSoundSummary,
    currentVibeArtworkUrl,
    elapsedSeconds,
    hasActiveLayers,
    showMiniPlayer,

    // elapsed clock
    beginSessionClock,
    pauseElapsedTicker,
    resumeElapsedTicker,
    resetElapsed,

    // vibe context
    setCurrentVibe,
    clearCurrentVibe,

    // playback
    playVibe,
    playPlan,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    restartPlayback,
    syncBackgroundAudioTitle,

    // cache
    clearAudioCache,
    cacheVibeAudio,
  };
});
