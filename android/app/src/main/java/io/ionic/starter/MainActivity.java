package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Bridges Android system audio events to the Capacitor JS layer.
 *
 * ACTION_AUDIO_BECOMING_NOISY (headset unplugged / Bluetooth disconnected):
 *   Fires window event 'audioBecomingNoisy' consumed by audio-focus.service.ts.
 *   The receiver is registered for the activity lifetime (onCreate → onDestroy)
 *   so unplug events are still delivered while background audio runs with the
 *   foreground service — not only while the activity is in the resumed state.
 *
 * Task removal (app swiped from recents):
 *   Handled natively in AndroidForegroundService.onTaskRemoved() via a patch-package
 *   patch on @capawesome-team/capacitor-android-foreground-service. That service is
 *   already registered in the manifest by the plugin's own AAR — no additional entry
 *   in this app's AndroidManifest.xml is required. See patches/ directory.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    private boolean noisyReceiverRegistered = false;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                return;
            }

            Log.d(TAG, "ACTION_AUDIO_BECOMING_NOISY — bridging to JS");

            if (getBridge() == null) {
                Log.w(TAG, "Bridge not ready — ignoring ACTION_AUDIO_BECOMING_NOISY");
                return;
            }

            // Dispatch a plain window event; audio-focus.service.ts listens for it.
            getBridge().triggerWindowJSEvent("audioBecomingNoisy", "{}");
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerNoisyReceiver();
    }

    @Override
    public void onDestroy() {
        unregisterNoisyReceiver();
        super.onDestroy();
    }

    private void registerNoisyReceiver() {
        if (noisyReceiverRegistered) {
            return;
        }

        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, filter);
        }
        noisyReceiverRegistered = true;
        Log.d(TAG, "ACTION_AUDIO_BECOMING_NOISY receiver registered (activity lifetime)");
    }

    private void unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) {
            return;
        }

        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "noisyReceiver not registered, skipping unregister");
        }
        noisyReceiverRegistered = false;
        Log.d(TAG, "ACTION_AUDIO_BECOMING_NOISY receiver unregistered");
    }
}
