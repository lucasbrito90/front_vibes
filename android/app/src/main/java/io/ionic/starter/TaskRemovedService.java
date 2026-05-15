package io.ionic.starter;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

/**
 * TaskRemovedService — stops all audio and kills the process when the user
 * explicitly removes Ixora from the Android recent-apps list.
 *
 * ## Why this service exists
 *
 * The app uses background audio (backgroundPlayback: true) so the user can lock
 * the screen or switch apps while a vibe continues playing. However, if the user
 * swipes the app away from the recent-apps list, we want all audio to stop
 * immediately — not continue playing as a ghost process.
 *
 * ## Why onTaskRemoved() on a Service?
 *
 * Android calls Service.onTaskRemoved() when the user explicitly removes a task
 * from the recent-apps list. It is NOT called when:
 *   - The user presses the Home button  (app goes to background normally)
 *   - The screen locks
 *   - The user switches to another app
 *   - The system temporarily kills the process to reclaim memory
 *
 * This makes it the precise lifecycle hook for "user intentionally closed the app".
 * Activities do not have this callback.
 *
 * ## Why killProcess()?
 *
 * When onTaskRemoved() fires, the WebView/JS runtime (Capacitor bridge) is likely
 * already destroyed. Calling NativeAudio.deinitPlugin() through JS is unreliable at
 * this point. Killing the process is the only safe guarantee that:
 *   1. ExoPlayer (same process, managed by @capgo/native-audio) stops immediately
 *   2. The Foreground Service (same process) is terminated
 *   3. Android automatically removes the foreground notification
 *   4. Android automatically abandons AudioFocus
 *
 * This is NOT used for normal backgrounding (Home, lock screen, app switch).
 *
 * ## How it is started
 *
 * MainActivity.onCreate() calls startService(new Intent(this, TaskRemovedService.class)).
 * The service is START_NOT_STICKY so Android does not restart it after a process kill.
 * android:stopWithTask="false" keeps it alive even when the main task is removed,
 * which is required so onTaskRemoved() is still called on that event.
 */
public class TaskRemovedService extends Service {

    private static final String TAG = "TaskRemovedService";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "TaskRemovedService started");
        // START_NOT_STICKY: Android will NOT restart this service after a killProcess().
        return START_NOT_STICKY;
    }

    /**
     * Called when the user explicitly removes the Ixora task from the recent-apps list.
     * NOT called on Home press, lock screen, or app switch.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.d(TAG, "onTaskRemoved — user closed app from recents; stopping audio process");

        // Kill the entire process. This terminates:
        //   - ExoPlayer (managed by @capgo/native-audio)
        //   - The @capawesome foreground service and its notification
        //   - AudioFocus is abandoned automatically by the OS
        // The JS bridge is likely already dead at this point, so direct JS calls
        // (NativeAudio.deinitPlugin, ForegroundService.stop) are not reliable.
        android.os.Process.killProcess(android.os.Process.myPid());
        stopSelf();
    }
}
