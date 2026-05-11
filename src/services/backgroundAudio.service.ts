/**
 * backgroundAudio.service.ts
 *
 * Manages the Android Foreground Service that keeps the app process alive when
 * audio is playing in the background or with the screen locked.
 *
 * ## Role in the audio stack
 * @capgo/native-audio (configured with backgroundPlayback: true) skips its own
 * auto-pause/resume so ExoPlayer keeps running when the app backgrounds. However,
 * Android still kills the process after ~1-2 min without a foreground service.
 * This service posts a minimal indicator notification, which tells Android to
 * keep the process alive indefinitely.
 *
 * ## Notification design (two-notification approach)
 * Since NativeAudio.configure({ showNotification: true }) creates a full
 * MediaStyle notification with lock-screen / media controls, this service uses
 * a LOW-importance channel ('vibes_bg_service') so its notification is subtle
 * and does not compete visually with the NativeAudio media notification.
 *
 * ## Notification permission (Android 13+)
 * POST_NOTIFICATIONS must be granted at runtime (manifest declaration is not
 * enough). We request it once per session before calling startForegroundService.
 *
 * ## Lifecycle
 * - startBackgroundAudio(vibeName): check/request permission → create channel → start service
 * - updateBackgroundAudioTitle(vibeName): refresh notification body on vibe switch
 * - stopBackgroundAudio(): stop service and dismiss notification
 *
 * ## Platform guard
 * All public functions are no-ops on web (ionic serve) — plugin is Android only.
 */

import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { toastController } from '@ionic/vue';
import { createLogger } from '@/utils/player-debug';

const log = createLogger('BackgroundAudio');

// Android FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK = 2.
// The capawesome ServiceType enum only exposes Location (8) and Microphone (128).
const SERVICE_TYPE_MEDIA_PLAYBACK = 2;

const NOTIFICATION_ID   = 101;
// Separate channel from NativeAudio's own media notification channel so we
// can keep this at Low importance (visible but not intrusive).
const CHANNEL_ID        = 'vibes_bg_service';
const NOTIFICATION_ICON = 'ic_stat_audio';

/** True when the foreground service is currently running. */
let _serviceRunning = false;

/**
 * True after we have checked/requested POST_NOTIFICATIONS at least once.
 * We only show the permission dialog once per app session.
 */
let _permissionChecked = false;

/** True only on Android native. */
const _isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

// ── Permission handling ───────────────────────────────────────────────────────

/**
 * Check and, if necessary, request the POST_NOTIFICATIONS runtime permission
 * (required on Android 13+). Returns true if permission is granted after the check.
 *
 * Only runs once per session. Subsequent calls skip the dialog.
 */
async function _ensureNotificationPermission(): Promise<boolean> {
  if (_permissionChecked) return true;
  _permissionChecked = true;

  try {
    const status = await ForegroundService.checkPermissions();
    log.debug('notification permission status', { display: status.display });

    if (status.display === 'granted') {
      return true;
    }

    // 'prompt' or 'prompt-with-rationale' → show the system dialog.
    if (status.display !== 'denied') {
      log.debug('requesting POST_NOTIFICATIONS permission');
      const result = await ForegroundService.requestPermissions();
      log.debug('permission request result', { display: result.display });

      if (result.display === 'granted') {
        return true;
      }
    }

    // Permission denied — show an informational toast.
    log.warn('POST_NOTIFICATIONS permission denied — foreground notification will not appear');
    _showPermissionDeniedToast();
    return false;
  } catch (err) {
    // Plugin may throw on API < 33 where no runtime permission is needed.
    // Treat as "granted" (the system will show the notification automatically).
    log.debug('checkPermissions threw (probably API < 33, treating as granted)', { err });
    return true;
  }
}

function _showPermissionDeniedToast(): void {
  void toastController.create({
    message:  'Enable notifications so the audio player stays visible in the background',
    duration: 5000,
    position: 'top',
    color:    'warning',
    buttons:  [{ text: 'OK', role: 'cancel' }],
  }).then(t => t.present());
}

// ── Notification channel ──────────────────────────────────────────────────────

/**
 * Create the notification channel if it does not already exist.
 * Must be called before startForegroundService on Android 8+ (API 26+).
 *
 * Importance.Default (3) — silent but always visible in the shade.
 * We intentionally avoid Importance.High/Max to prevent heads-up popups
 * every time a vibe starts.
 */
async function _ensureNotificationChannel(): Promise<void> {
  try {
    await ForegroundService.createNotificationChannel({
      id:          CHANNEL_ID,
      name:        'Background Playback Service',
      description: 'Keeps audio running in the background. Media controls appear in a separate notification.',
      importance:  2, // Importance.Low — visible in shade, no sound, no status-bar icon,
      // so it does not compete with NativeAudio's own MediaStyle media notification.
    });
    log.debug('notification channel created/confirmed', { channelId: CHANNEL_ID });
  } catch (err) {
    log.debug('createNotificationChannel — already exists or failed', { err });
  }
}

// ── Notification payload ──────────────────────────────────────────────────────

function _notificationPayload(vibeName: string) {
  const payload = {
    id:                    NOTIFICATION_ID,
    title:                 'Vibes',
    body:                  vibeName || 'Playing…',
    smallIcon:             NOTIFICATION_ICON,
    notificationChannelId: CHANNEL_ID,
    silent:                true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serviceType:           SERVICE_TYPE_MEDIA_PLAYBACK as any,
  };
  log.debug('notification payload', payload);
  return payload;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the Android foreground service.
 *
 * Flow:
 *   1. Check / request POST_NOTIFICATIONS permission (Android 13+).
 *   2. Create the notification channel (idempotent).
 *   3. Start the foreground service with a mediaPlayback notification.
 *
 * If the service is already running, updates the notification title instead.
 * No-op on web / iOS.
 */
export async function startBackgroundAudio(vibeName: string): Promise<void> {
  if (!_isAndroid) return;

  if (_serviceRunning) {
    log.debug('startBackgroundAudio — already running, updating title');
    await updateBackgroundAudioTitle(vibeName);
    return;
  }

  log.debug('startBackgroundAudio', { vibeName });

  // Step 1 — permission (non-blocking: we start the service regardless so that
  // background audio continues even if the user denies the notification).
  await _ensureNotificationPermission();

  // Step 2 — channel (must exist before startForegroundService).
  await _ensureNotificationChannel();

  // Step 3 — start service.
  try {
    const payload = _notificationPayload(vibeName);
    await ForegroundService.startForegroundService(payload);
    _serviceRunning = true;
    log.debug('startBackgroundAudio — foreground service started successfully');
  } catch (err) {
    log.warn('startBackgroundAudio — startForegroundService failed', { err });
  }
}

/**
 * Update the foreground service notification body without stopping the service.
 * Useful when a new vibe starts while the service is already running.
 * No-op on web or when the service is not running.
 */
export async function updateBackgroundAudioTitle(vibeName: string): Promise<void> {
  if (!_isAndroid || !_serviceRunning) return;

  log.debug('updateBackgroundAudioTitle', { vibeName });

  try {
    await ForegroundService.updateForegroundService(_notificationPayload(vibeName));
    log.debug('updateBackgroundAudioTitle — notification updated');
  } catch (err) {
    log.warn('updateBackgroundAudioTitle — failed', { err });
  }
}

/**
 * Stop the Android foreground service and dismiss the notification.
 * No-op on web or when the service is not running.
 */
export async function stopBackgroundAudio(): Promise<void> {
  if (!_isAndroid || !_serviceRunning) return;

  log.debug('stopBackgroundAudio — stopping foreground service');

  try {
    await ForegroundService.stopForegroundService();
    _serviceRunning = false;
    log.debug('stopBackgroundAudio — foreground service stopped');
  } catch (err) {
    log.warn('stopBackgroundAudio — stopForegroundService failed', { err });
    _serviceRunning = false;
  }
}

/** True when the foreground service is currently active. */
export function isBackgroundAudioRunning(): boolean {
  return _serviceRunning;
}
