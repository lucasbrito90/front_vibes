/**
 * audio-focus.service.ts
 *
 * Handles audio interruption events that @capgo/native-audio does NOT expose:
 *   - Headset/Bluetooth disconnect (ACTION_AUDIO_BECOMING_NOISY)
 *
 * Audio focus changes (transient loss, permanent loss, focus gain) are handled
 * directly inside audio-player.service.ts via the NativeAudio 'playbackState'
 * listener (reasons: audioFocusLossTransient, audioFocusLoss, audioFocusGain).
 *
 * How headset disconnect works:
 *   MainActivity.java registers a BroadcastReceiver for
 *   AudioManager.ACTION_AUDIO_BECOMING_NOISY and bridges it to the JS layer via
 *   bridge.triggerWindowJSEvent('audioBecomingNoisy', '{}').
 *   This service listens for that window event and pauses playback.
 *
 * Initialise once at app root (App.vue) via initAudioFocusService().
 */

import { Capacitor } from '@capacitor/core';
import { createLogger } from '@/utils/player-debug';

const log = createLogger('AudioFocus');
const _isNative = Capacitor.isNativePlatform();

type PauseCb = () => void;

let _onBecomingNoisy: PauseCb | null = null;
let _initialised = false;

/**
 * Register the store's pausePlayback action to be called on headset disconnect.
 * Called once from player.store.ts alongside setMediaControlCallbacks().
 */
export function setAudioFocusCallbacks(opts: { onBecomingNoisy: PauseCb }): void {
  _onBecomingNoisy = opts.onBecomingNoisy;
}

/**
 * Register the window-level event listener for headset/Bluetooth disconnect.
 * Safe to call multiple times — registers only once.
 */
export function initAudioFocusService(): void {
  if (!_isNative || _initialised) return;
  _initialised = true;

  // Dispatched by MainActivity.java when ACTION_AUDIO_BECOMING_NOISY fires
  // (headphones unplugged, Bluetooth disconnected, etc.).
  window.addEventListener('audioBecomingNoisy', () => {
    log.debug('[Headset] AUDIO_BECOMING_NOISY — pausing playback');
    _onBecomingNoisy?.();
  });

  log.debug('[Headset] audioBecomingNoisy listener registered');
}
