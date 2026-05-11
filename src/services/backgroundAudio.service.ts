/**
 * backgroundAudio.service.ts
 *
 * Manages the Android Foreground Service that keeps audio alive when the app
 * is in the background or the screen is locked.
 *
 * ## Why a foreground service is required
 * @capgo/native-audio with `backgroundPlayback: true` (set in audio-player.service.ts)
 * skips its own auto-pause/resume on app lifecycle events, so the ExoPlayer
 * instances keep running. However, Android will still kill the main app process
 * after ~1-2 minutes in background without a foreground service. The foreground
 * service posts a persistent notification, which tells Android to keep the
 * process alive.
 *
 * ## Lifecycle
 * - Call `startBackgroundAudio(vibeName)` when playback starts.
 * - Call `updateBackgroundAudioTitle(vibeName)` to refresh the notification
 *   text after a vibe switch without stopping and restarting the service.
 * - Call `stopBackgroundAudio()` when playback stops.
 *
 * ## Platform guard
 * All methods are no-ops on web (ionic serve) because the foreground service
 * plugin only runs on Android.
 *
 * ## Singleton guard
 * The service tracks whether a foreground service is currently running to
 * avoid double-starting or double-stopping. Start/stop calls outside of
 * expected state are silently ignored.
 */

import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { createLogger } from '@/utils/player-debug';

const log = createLogger('BackgroundAudio');

// Android FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK = 2.
// The capawesome ServiceType enum only exposes Location (8) and Microphone (128),
// so we declare the raw value here and cast it as needed.
const SERVICE_TYPE_MEDIA_PLAYBACK = 2;

const NOTIFICATION_ID    = 101;
const CHANNEL_ID         = 'vibes_playback';
const NOTIFICATION_ICON  = 'ic_stat_audio';

/** True when the foreground service is currently running. */
let _serviceRunning = false;

/** True only on Android native (foreground service is not available on web/iOS). */
const _isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

// ── Private helpers ───────────────────────────────────────────────────────────

async function _ensureNotificationChannel(): Promise<void> {
  try {
    await ForegroundService.createNotificationChannel({
      id:          CHANNEL_ID,
      name:        'Playback',
      description: 'Shown while a vibe is playing in the background',
      importance:  2, // Importance.Low — no sound, no heads-up
    });
  } catch (err) {
    // Channel may already exist; ignore duplicate-creation errors.
    log.debug('createNotificationChannel skipped (may already exist)', { err });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the Android foreground service.
 * Posts a persistent notification so Android keeps the process alive
 * while audio plays in the background or with the screen locked.
 *
 * No-op on web or if the service is already running.
 */
export async function startBackgroundAudio(vibeName: string): Promise<void> {
  if (!_isAndroid) return;
  if (_serviceRunning) {
    log.debug('startBackgroundAudio — already running, updating title instead');
    await updateBackgroundAudioTitle(vibeName);
    return;
  }

  log.debug('startBackgroundAudio', { vibeName });

  try {
    await _ensureNotificationChannel();

    await ForegroundService.startForegroundService({
      id:                    NOTIFICATION_ID,
      title:                 'Vibes',
      body:                  vibeName || 'Playing…',
      smallIcon:             NOTIFICATION_ICON,
      notificationChannelId: CHANNEL_ID,
      silent:                true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceType:           SERVICE_TYPE_MEDIA_PLAYBACK as any,
    });

    _serviceRunning = true;
    log.debug('startBackgroundAudio — foreground service started');
  } catch (err) {
    log.warn('startBackgroundAudio — failed to start foreground service', { err });
  }
}

/**
 * Update the foreground service notification body without stopping
 * and restarting the service. Useful when a new vibe starts while
 * the service is already running.
 *
 * No-op on web or if the service is not running.
 */
export async function updateBackgroundAudioTitle(vibeName: string): Promise<void> {
  if (!_isAndroid || !_serviceRunning) return;

  log.debug('updateBackgroundAudioTitle', { vibeName });

  try {
    await ForegroundService.updateForegroundService({
      id:                    NOTIFICATION_ID,
      title:                 'Vibes',
      body:                  vibeName || 'Playing…',
      smallIcon:             NOTIFICATION_ICON,
      notificationChannelId: CHANNEL_ID,
      silent:                true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceType:           SERVICE_TYPE_MEDIA_PLAYBACK as any,
    });
  } catch (err) {
    log.warn('updateBackgroundAudioTitle — failed', { err });
  }
}

/**
 * Stop the Android foreground service and dismiss the notification.
 * No-op on web or if the service is not running.
 */
export async function stopBackgroundAudio(): Promise<void> {
  if (!_isAndroid || !_serviceRunning) return;

  log.debug('stopBackgroundAudio — stopping foreground service');

  try {
    await ForegroundService.stopForegroundService();
    _serviceRunning = false;
    log.debug('stopBackgroundAudio — foreground service stopped');
  } catch (err) {
    log.warn('stopBackgroundAudio — failed to stop foreground service', { err });
    // Force-reset the flag so future start attempts are not blocked.
    _serviceRunning = false;
  }
}

/** True when the foreground service is currently active. */
export function isBackgroundAudioRunning(): boolean {
  return _serviceRunning;
}
