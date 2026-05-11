/**
 * useAppLifecycleAudio
 *
 * Bridges Capacitor's app lifecycle (foreground / background) with the
 * audio engine, while supporting true background audio via a foreground service.
 *
 * ## Behaviour when background audio is active (normal case)
 * When a vibe is playing and the Android foreground service is running
 * (managed by backgroundAudio.service.ts), the app going to background is
 * intentional — audio should continue uninterrupted. In this case:
 *   - We do NOT pause playback.
 *   - We do NOT show a toast.
 *   - NativeAudio is already configured with backgroundPlayback: true, so its
 *     ExoPlayer instances keep running.
 *   - The foreground service keeps the process alive.
 *   - When the user returns, the player state is still 'playing' and the
 *     Mini Player remains visible and correct.
 *
 * ## Behaviour when background audio is NOT active (web / fallback)
 * If we are on web (ionic serve) or the foreground service is not running
 * (e.g. playback had already stopped), the original graceful-pause behaviour
 * is applied:
 *   1. Immediately soft-pauses playback on background so the UI state stays
 *      consistent (playbackState → 'paused', vibe context and elapsed time
 *      preserved, mini player stays visible as 'paused').
 *   2. When the app returns to foreground, keeps the player paused and shows
 *      an informational toast so the user can manually resume.
 *
 * ## What this is NOT
 * This does not implement background audio by itself. Background audio is
 * powered by:
 *   - @capgo/native-audio configured with backgroundPlayback: true
 *   - The Android foreground service in backgroundAudio.service.ts
 *
 * ## Singleton guard
 * The listener must be registered exactly once for the lifetime of the app.
 * Calling this composable multiple times is safe — subsequent calls are no-ops.
 */

import { App } from '@capacitor/app';
import { toastController } from '@ionic/vue';

import { usePlayerStore } from '@/stores/player.store';
import { isBackgroundAudioRunning } from '@/services/backgroundAudio.service';

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
   * True only when WE triggered the pause because the app went to background
   * and background audio was not running. Prevents showing the "paused in
   * background" toast if the user had already paused manually before minimising.
   */
  let _pausedByBackground = false;

  App.addListener('appStateChange', async ({ isActive }) => {

    // ── App going to background ─────────────────────────────────────────────
    if (!isActive) {
      // If the foreground service is running, audio will continue in background.
      // Do not interfere — NativeAudio is configured with backgroundPlayback: true
      // and the foreground service keeps the process alive.
      if (isBackgroundAudioRunning()) {
        return;
      }

      if (store.playbackState === 'playing') {
        /*
         * Fallback path (web or foreground service not running):
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
      message:  'Playback was paused while the app was in background',
      duration: 3500,
      position: 'top',
      color:    'medium',
      buttons:  [{ text: 'OK', role: 'cancel' }],
    });

    await toast.present();
  });
}
