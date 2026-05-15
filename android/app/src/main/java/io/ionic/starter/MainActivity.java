package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Bridges Android system audio events to the Capacitor JS layer.
 *
 * ACTION_AUDIO_BECOMING_NOISY (headset unplugged / Bluetooth disconnected):
 *   Fires window event 'audioBecomingNoisy' consumed by audio-focus.service.ts.
 *   The receiver is registered in onResume and unregistered in onPause to avoid
 *   leaking the registration when the activity is destroyed.
 *
 * TaskRemovedService:
 *   Started in onCreate() so that Service.onTaskRemoved() fires when the user
 *   explicitly removes Ixora from the recent-apps list. This stops all audio
 *   and kills the process. It does NOT fire on Home press or lock screen.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                Log.d(TAG, "ACTION_AUDIO_BECOMING_NOISY — bridging to JS");
                // Dispatch a plain window event; audio-focus.service.ts listens for it.
                getBridge().triggerWindowJSEvent("audioBecomingNoisy", "{}");
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Start the task-removed watchdog. TaskRemovedService.onTaskRemoved() fires
        // when the user explicitly swipes the app away from the recent-apps list,
        // killing the process so ExoPlayer and the Foreground Service stop cleanly.
        startService(new Intent(this, TaskRemovedService.class));
    }

    @Override
    public void onResume() {
        super.onResume();
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiver(noisyReceiver, filter);
    }

    @Override
    public void onPause() {
        super.onPause();
        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException e) {
            // Receiver was never registered (e.g. onCreate → onPause without onResume).
            Log.w(TAG, "noisyReceiver not registered, skipping unregister");
        }
    }
}
