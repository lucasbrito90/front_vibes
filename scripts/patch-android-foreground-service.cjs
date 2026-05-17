/**
 * patch-android-foreground-service.cjs
 *
 * Postinstall script that adds onTaskRemoved() to AndroidForegroundService.java
 * from the @capawesome-team/capacitor-android-foreground-service plugin.
 *
 * Why this exists:
 *   - When the user swipes Ixora from the recent-apps list, the Capacitor JS bridge
 *     is already destroyed — NativeAudio cannot be stopped via JS.
 *   - Service.onTaskRemoved() is the only reliable native hook for this event.
 *   - The @capawesome plugin does not expose this callback, so we patch it here.
 *   - This script is idempotent: it checks if the patch is already applied before
 *     modifying the file.
 *
 * How it works:
 *   - Reads AndroidForegroundService.java from node_modules
 *   - Inserts onTaskRemoved() before onStartCommand() if not already present
 *   - Adds import android.util.Log if not already present
 *
 * Run automatically via package.json postinstall hook.
 *
 * adb logcat tags: IxoraTaskRemoved, IxoraForegroundServiceStop, IxoraNativeAudioStop
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capawesome-team',
  'capacitor-android-foreground-service',
  'android',
  'src',
  'main',
  'java',
  'io',
  'capawesome',
  'capacitorjs',
  'plugins',
  'foregroundservice',
  'AndroidForegroundService.java',
);

const ON_TASK_REMOVED_MARKER = 'onTaskRemoved';
const LOG_IMPORT = 'import android.util.Log;';
const INSERT_BEFORE = '@Override\n    public int onStartCommand(Intent intent, int flags, int startId)';

const ON_TASK_REMOVED_METHOD = `    /**
     * Called when the user explicitly removes Ixora from the Android recent-apps list.
     *
     * NOT called on Home press, lock screen, or app switch — only on explicit task removal.
     * This makes it the correct hook for "app was intentionally closed by the user".
     *
     * The Capacitor JS bridge is already destroyed at this point, so NativeAudio cannot be
     * stopped via JS. killProcess() is the only reliable teardown.
     *
     * Added by scripts/patch-android-foreground-service.cjs (postinstall).
     * adb logcat tags: IxoraTaskRemoved | IxoraForegroundServiceStop | IxoraNativeAudioStop
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        android.util.Log.d("IxoraTaskRemoved", "onTaskRemoved — user closed app from recents");
        android.util.Log.d("IxoraForegroundServiceStop", "Stopping foreground notification");
        // Remove the foreground notification cleanly before killing the process.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            stopForeground(android.app.Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        android.util.Log.d("IxoraNativeAudioStop", "Killing process — stops ExoPlayer and all audio");
        // killProcess() terminates ExoPlayer (NativeAudio), this service, and all threads.
        // START_STICKY does NOT restart after onTaskRemoved-triggered kills.
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    `;

if (!fs.existsSync(TARGET)) {
  console.warn('[patch-android-foreground-service] Target file not found — skipping:', TARGET);
  process.exit(0);
}

let content = fs.readFileSync(TARGET, 'utf8');

if (content.includes(ON_TASK_REMOVED_MARKER)) {
  console.log('[patch-android-foreground-service] onTaskRemoved already present — nothing to do.');
  process.exit(0);
}

// Add import android.util.Log if missing
if (!content.includes(LOG_IMPORT)) {
  content = content.replace(
    'import android.os.IBinder;',
    'import android.os.IBinder;\n' + LOG_IMPORT,
  );
}

// Insert onTaskRemoved() before onStartCommand()
if (!content.includes(INSERT_BEFORE)) {
  console.error('[patch-android-foreground-service] Could not find insertion point (onStartCommand). Plugin structure may have changed.');
  process.exit(1);
}

content = content.replace(
  '    @Override\n    public int onStartCommand(Intent intent, int flags, int startId)',
  ON_TASK_REMOVED_METHOD + '@Override\n    public int onStartCommand(Intent intent, int flags, int startId)',
);

fs.writeFileSync(TARGET, content, 'utf8');
console.log('[patch-android-foreground-service] ✓ onTaskRemoved() injected into AndroidForegroundService.java');
