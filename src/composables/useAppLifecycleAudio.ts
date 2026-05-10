/**
 * useAppLifecycleAudio
 *
 * Bridges Capacitor's app lifecycle (foreground / background) with the
 * web-based HTMLAudioElement audio engine.
 *
 * ## Why this is needed
 * HTMLAudioElement running inside a WebView is not a native audio player.
 * Android treats it as browser audio and suspends / kills it after ~2 min
 * in background. This composable:
 *   1. Detects when the app goes background and immediately pauses playback
 *      so the UI state stays consistent (playbackState → 'paused', vibe
 *      context and elapsed time preserved, mini player stays visible).
 *   2. When the app returns to foreground, keeps the player paused and
 *      shows an informational toast so the user can manually resume.
 *
 * ## What this is NOT
 * This does NOT implement background audio. Audio still stops after Android
 * suspends the WebView. This only prevents the UI from becoming inconsistent.
 *
 * ## True background audio requirements (future work)
 * - Android Foreground Service with MediaPlayer/ExoPlayer
 * - AudioFocus management
 * - MediaSession for lock-screen controls
 * - A native Capacitor plugin bridging the above to JavaScript
 *
 * ## Singleton guard
 * The listener must be registered exactly once for the lifetime of the app.
 * Calling this composable multiple times is safe — subsequent calls are no-ops.
 */

import { App } from '@capacitor/app';
import { toastController } from '@ionic/vue';

import { usePlayerStore } from '@/stores/player.store';

// ── Singleton guard ───────────────────────────────────────────────────────────

let _initialized = false;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register the Capacitor appStateChange listener once.
 * Call this from App.vue's setup() (not inside a component that mounts/unmounts).
 */
export function useAppLifecycleAudio(): void {
  if (_initialized) return;
  _initialized = true;

  const store = usePlayerStore();

  /**
   * True only when WE triggered the pause because the app went to background.
   * Prevents showing the "paused in background" toast if the user had already
   * paused manually before minimising.
   */
  let _pausedByBackground = false;

  App.addListener('appStateChange', async ({ isActive }) => {

    // ── App going to background ─────────────────────────────────────────────
    if (!isActive) {
      if (store.playbackState === 'playing') {
        /*
         * Immediately soft-pause before Android suspends the WebView.
         * store.pausePlayback() calls audioPlayerService.pauseAll() and
         * freezes the elapsed ticker. It does NOT clear currentVibeId /
         * currentVibeName, so the Mini Player remains visible as 'paused'.
         */
        store.pausePlayback();
        _pausedByBackground = true;
      }
      return;
    }

    // ── App returning to foreground ─────────────────────────────────────────
    if (!_pausedByBackground) return;

    _pausedByBackground = false;

    /*
     * Do NOT auto-resume here.
     * The HTMLAudioElement might have been killed by Android; auto-resuming
     * could produce silence or an error with no feedback. The user should
     * consciously choose to tap Resume in the mini player or player page.
     */

    const toast = await toastController.create({
      message: 'Playback was paused while the app was in background',
      duration: 3500,
      position: 'top',
      color: 'medium',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });

    await toast.present();
  });
}
