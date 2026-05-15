package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Bridges Android system audio events to the Capacitor JS layer.
 *
 * ACTION_AUDIO_BECOMING_NOISY (headset unplugged / Bluetooth disconnected):
 *   Fires window event 'audioBecomingNoisy' consumed by audio-focus.service.ts.
 *   The receiver is registered in onResume and unregistered in onPause to avoid
 *   leaking the registration when the activity is destroyed.
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
    protected void onResume() {
        super.onResume();
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiver(noisyReceiver, filter);
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException e) {
            // Receiver was never registered (e.g. onCreate → onPause without onResume).
            Log.w(TAG, "noisyReceiver not registered, skipping unregister");
        }
    }
}
