# Android Native Customizations

## Overview

The Ixora app (Ionic + Vue 3 + Capacitor 8) has grown beyond a standard Capacitor project.
Several Android-specific features required manual modifications to native files that Capacitor
**does not manage automatically** and would be **lost** if the Android platform is recreated.

### Why native customizations exist

| Feature | Reason |
|---|---|
| Background audio | Android kills processes without a Foreground Service |
| MediaSession / lock screen controls | Requires native `MediaSessionCompat` wiring via plugin config |
| Audio focus handling | Android AudioManager events not exposed by most Capacitor plugins |
| Headset disconnect | `ACTION_AUDIO_BECOMING_NOISY` requires a `BroadcastReceiver` |
| Runtime permissions | `POST_NOTIFICATIONS` must be requested at runtime on Android 13+ |

### Risks when recreating `android/`

> ⚠️ **NEVER run `npx cap add android` or `npx cap rm android` without a full backup.**

Running either command will regenerate the Android platform from scratch and **erase all manual
changes** documented here. If you must recreate the platform, use this document as the source
of truth to re-apply every modification.

### Capacitor upgrade considerations

Capacitor upgrades may regenerate or patch `AndroidManifest.xml` and `MainActivity.java`.
Always diff those files against this document after any `npm update @capacitor/*` operation.

---

## Section 1 — MainActivity modifications

**File:** `android/app/src/main/java/io/ionic/starter/MainActivity.java`

### What was added

A `BroadcastReceiver` that listens for `AudioManager.ACTION_AUDIO_BECOMING_NOISY` —
the Android system broadcast fired when audio output is about to become "noisy"
(wired headphones unplugged, Bluetooth headset disconnected, etc.).

Without this receiver, Android continues routing audio to the speaker automatically, which
is undesirable for an ambient audio app — users expect playback to pause immediately.

### How it works

1. In `onResume()`, the receiver is registered for `ACTION_AUDIO_BECOMING_NOISY`.
2. When the broadcast fires, the receiver calls `getBridge().triggerWindowJSEvent(...)` to
   dispatch a native-to-JS event named `"audioBecomingNoisy"` on `window`.
3. `src/services/audio-focus.service.ts` listens for that event and calls `pausePlayback()`
   via the Pinia store callback registered at startup.
4. In `onPause()`, the receiver is unregistered to avoid leaking it when the activity stops.

### Access modifier note

`BridgeActivity` (the Capacitor base class) declares `onResume()` and `onPause()` as `public`.
Java forbids overriding a `public` method with `protected`, so both overrides must remain `public`.

### Current file

```java
package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                Log.d(TAG, "ACTION_AUDIO_BECOMING_NOISY — bridging to JS");
                getBridge().triggerWindowJSEvent("audioBecomingNoisy", "{}");
            }
        }
    };

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
            Log.w(TAG, "noisyReceiver not registered, skipping unregister");
        }
    }
}
```

### JS counterpart

`src/services/audio-focus.service.ts` — `initAudioFocusService()` registers the window listener.
`src/stores/player.store.ts` — `setAudioFocusCallbacks()` wires `pausePlayback()` as the handler.
Both are initialised in `src/App.vue` and `player.store.ts` respectively.

---

## Section 2 — AndroidManifest modifications

**File:** `android/app/src/main/AndroidManifest.xml`

### Permissions added (beyond Capacitor defaults)

```xml
<!-- Required to start and maintain an Android Foreground Service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- Declares this foreground service handles media playback specifically.
     Required on Android 14+ to start a foreground service of type mediaPlayback. -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Prevents the CPU from sleeping while audio is playing in the background. -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Android 13+ (API 33) requires explicit runtime permission for notifications.
     Declared here so the system knows it may be requested at runtime.
     Must also be requested via ForegroundService.requestPermissions() — see Section 3. -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### Components added

```xml
<!-- BroadcastReceiver for the @capawesome foreground service plugin.
     Handles taps on notification action buttons (e.g. Stop). -->
<receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />

<!-- The foreground service itself. foregroundServiceType="mediaPlayback" is required
     so Android allows it to run in the foreground during audio playback. -->
<service
    android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService"
    android:foregroundServiceType="mediaPlayback" />
```

### Full manifest (current state)

```xml
<?xml version='1.0' encoding='utf-8'?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:exported="true"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:name=".MainActivity"
            android:theme="@style/AppTheme.NoActionBarLaunch">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true"
            android:name="androidx.core.content.FileProvider">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

        <!-- @capawesome-team/capacitor-android-foreground-service -->
        <receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />
        <service
            android:foregroundServiceType="mediaPlayback"
            android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" />
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
</manifest>
```

---

## Section 3 — Foreground Service

**Plugin:** `@capawesome-team/capacitor-android-foreground-service@8.1.0`  
**Service file:** `src/services/backgroundAudio.service.ts`

### Why this plugin exists

`@capgo/native-audio` configured with `backgroundPlayback: true` tells ExoPlayer to keep
playing when the app backgrounds. However, Android still kills the app process after ~1–2
minutes unless a Foreground Service is running. This service posts a persistent indicator
notification, which signals to Android that the process is doing active work and must not
be killed.

### Two-notification architecture

The app intentionally runs **two separate notifications**:

| Notification | Source | Purpose | Channel importance |
|---|---|---|---|
| **Media notification** | `@capgo/native-audio` (`showNotification: true`) | Lock screen / media controls (play, pause, stop, artwork) | Default |
| **Foreground indicator** | `@capawesome-team/capacitor-android-foreground-service` | Keep process alive in background | Low (`vibes_bg_service` channel) |

The foreground indicator is intentionally low-importance to avoid competing visually with the
rich media notification from NativeAudio.

### Runtime notification permission (Android 13+)

`POST_NOTIFICATIONS` is a runtime permission on Android 13 (API 33)+. The manifest declaration
is necessary but not sufficient. `backgroundAudio.service.ts` calls
`ForegroundService.checkPermissions()` and `ForegroundService.requestPermissions()` before
starting the service. If the user denies it, a toast is shown and background audio may
still work (system behaviour varies by device), but the notification will not appear.

### Key configuration

```typescript
// backgroundAudio.service.ts
const SERVICE_TYPE_MEDIA_PLAYBACK = 2; // Android FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
const CHANNEL_ID        = 'vibes_bg_service'; // Low-importance dedicated channel
const NOTIFICATION_ID   = 101;
const NOTIFICATION_ICON = 'ic_stat_audio';    // must exist in android/res/drawable/
```

### Lifecycle

```
playVibe()
  └─ player.store.ts → startBackgroundAudio(vibeName)
       ├─ checkPermissions() / requestPermissions()   (POST_NOTIFICATIONS)
       ├─ ForegroundService.createNotificationChannel({ importance: 2 })
       └─ ForegroundService.startForegroundService({ ... })

stopPlayback()
  └─ player.store.ts → stopBackgroundAudio()
       └─ ForegroundService.stopForegroundService()

switchVibe()
  └─ player.store.ts → updateBackgroundAudioTitle(newVibeName)
       └─ ForegroundService.updateForegroundService({ ... })
```

---

## Section 4 — NativeAudio integration

**Plugin:** `@capgo/native-audio@8.4.2`  
**Service file:** `src/services/audio-player.service.ts`

### One-time configuration (app startup)

```typescript
// src/services/audio-player.service.ts
await NativeAudio.configure({
  backgroundPlayback: true,  // Skip ExoPlayer auto-pause on app background
  showNotification:   true,  // Create MediaStyle notification + MediaSession
  focus:              true,  // Request Android AudioFocus
});
```

### Playback modes

| Mode | NativeAudio API | Notes |
|---|---|---|
| `loop` | `NativeAudio.loop({ assetId })` | Loops indefinitely; fade-in/out via `setVolume({ duration })` |
| `once` | `NativeAudio.play({ assetId })` | Plays once; completion detected via `'complete'` event |
| `interval` | `NativeAudio.play({ assetId })` | Called once per tick; next tick scheduled on `'complete'` |

All modes use stable asset IDs in the format `vibe-layer-{soundId}` across preload, play, stop, and unload.

### Architecture — Pinia ↔ Service separation

```
User tap / remote control / audio focus event
        │
        ▼
player.store.ts          ← Source of truth (reactive UI state)
  playbackState          ← 'idle' | 'playing' | 'paused'
  currentVibeId
  currentVibeArtworkUrl
  elapsedSeconds
        │
        ▼
audio-player.service.ts  ← Audio runtime (non-reactive)
  _layers[]              ← Active ManagedLayer list
  NativeAudio calls
  HTMLAudioElement fallback
        │
        ▼
@capgo/native-audio       ← Android ExoPlayer (native)
```

Components **never** call `NativeAudio` directly. They call Pinia actions only.

### playbackState listener

```typescript
NativeAudio.addListener('playbackState', (event) => {
  const { assetId, state, reason } = event;

  // Remote controls (lock screen / notification / Bluetooth)
  if (reason.startsWith('remote'))  { ... }  // → _onRemotePlay/Pause/Stop

  // Audio focus events (see Section 5)
  if (reason === 'audioFocusLossTransient') { ... }
  if (reason === 'audioFocusGain')          { ... }
  if (reason === 'audioFocusLoss')          { ... }
});
```

### Notification metadata (MediaSession artwork)

Passed in every `NativeAudio.preload()` call so Android can display vibe artwork on the
lock screen and in the notification shade:

```typescript
await NativeAudio.preload({
  assetId,
  assetPath: layer.fileUrl,
  isUrl: true,
  volume: preloadVol,
  audioChannelNum: 1,
  notificationMetadata: {
    title:     _notificationVibeName || layer.soundName,
    artist:    layer.soundName,
    artworkUrl: _notificationArtworkUrl || undefined,
  },
});
```

`_notificationVibeName` and `_notificationArtworkUrl` are updated by the Pinia store
before each `playVibe()` call via `setNotificationVibeName()` and `setNotificationArtworkUrl()`.

### Known limitation — loop fade-in

Loop layers start loud regardless of the configured `fadeInSeconds`. Tracked in
[GitHub issue #3](https://github.com/lucasbrito90/front_vibes/issues/3). Root cause: the
plugin does not reliably honour the `volume` parameter set before `loop()` on Android.
Workaround attempts (`setVolume(0)` before `loop()`) have not fully resolved it.

---

## Section 5 — Audio focus handling

**Service files:**
- `src/services/audio-player.service.ts` — focus event reactions via `playbackState` listener
- `src/services/audio-focus.service.ts` — headset disconnect via `audioBecomingNoisy` window event

### How Android audio focus works

When `NativeAudio.configure({ focus: true })` is called, the plugin registers as an
`AudioManager.OnAudioFocusChangeListener` and requests
`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`. This means:

- The plugin competes for audio focus with other apps
- Android OS handles **system-level ducking** automatically (no JS code needed)
- When another app takes focus, the plugin fires a `playbackState` event so we can sync Pinia state

### Focus event policy

| Android event | `playbackState` reason | Pinia action | Notes |
|---|---|---|---|
| `AUDIOFOCUS_LOSS_TRANSIENT` | `"audioFocusLossTransient"` | `pausePlayback()` + set `_pausedByAudioFocus = true` | GPS, voice command, brief notification |
| `AUDIOFOCUS_GAIN` | `"audioFocusGain"` | `resumePlayback()` **only if** `_pausedByAudioFocus` | Auto-resume after transient loss |
| `AUDIOFOCUS_LOSS` | `"audioFocusLoss"` | `stopPlayback()` + clear `_pausedByAudioFocus` | Phone call, Spotify taking over |

The `_pausedByAudioFocus` flag prevents auto-resuming when the user manually paused before
focus was regained.

### Headset / Bluetooth disconnect

**Android event:** `ACTION_AUDIO_BECOMING_NOISY`  
**Bridge path:** `MainActivity.java` → `window.audioBecomingNoisy` → `audio-focus.service.ts`

The `@capgo/native-audio` plugin does **not** handle this broadcast. Without intervention,
audio would continue playing through the device speaker when headphones are unplugged.

```
MainActivity.java (BroadcastReceiver)
    └─ getBridge().triggerWindowJSEvent("audioBecomingNoisy", "{}")
           └─ window.addEventListener("audioBecomingNoisy", ...)
                  └─ audio-focus.service.ts → onBecomingNoisy() → pausePlayback()
                         └─ player.store.ts → pausePlayback()
```

### Ducking

Ducking (reducing Ixora's volume when another app speaks briefly) is handled entirely
by Android OS. The `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` flag signals to Android that
it may lower Ixora's system volume temporarily. No JS code is needed for this. When the
other app stops, Android restores the volume automatically.

---

## Section 6 — Notifications and MediaSession

### Two separate notification channels

#### 1. Media notification (from `@capgo/native-audio`)

- Created automatically when `showNotification: true` in `configure()`
- Channel: `native_audio_channel` (managed by the plugin internally)
- Importance: Default — visible on lock screen with media controls
- Displays: vibe name (title), sound name (artist), artwork image, play/pause/stop buttons
- Uses Android `MediaStyle` format — appears in the lock screen media widget
- Artwork URL comes from `notificationMetadata.artworkUrl` in each `preload()` call

#### 2. Foreground service indicator (from `@capawesome-team/capacitor-android-foreground-service`)

- Created by `backgroundAudio.service.ts`
- Channel: `vibes_bg_service` — Low importance (no sound/vibration, collapses easily)
- Notification ID: `101`
- Purpose: process keepalive — tells Android the app is doing active work
- Icon: `ic_stat_audio` (must exist at `android/app/src/main/res/drawable/ic_stat_audio.xml`)

### Notification icon

The small notification icon `ic_stat_audio` must be a white-on-transparent vector drawable:

```
android/app/src/main/res/drawable/ic_stat_audio.xml
```

Android requires notification icons to be monochrome white on a transparent background.
Coloured icons will appear as a solid white square on Android 5+.

### Artwork image flow

```
Pinia store (currentVibeArtworkUrl)
    └─ setNotificationArtworkUrl(url)  [audio-player.service.ts]
           └─ stored as _notificationArtworkUrl
                  └─ included in notificationMetadata.artworkUrl on every NativeAudio.preload()
                         └─ displayed on Android lock screen and in notification
```

The `vibe.artwork_url` field in the API response is used as the primary source.
Fallback chain: `artwork_url` → `thumbnail_url`.

---

## Section 7 — Google Sign-In native

**Plugin:** `@codetrix-studio/capacitor-google-auth@3.4.0-rc.4`  
**Service file:** `src/services/auth.service.ts`  
**Composable:** `src/composables/useAuth.ts`  
**Init:** `src/main.ts`

### Why native Google Sign-In

Firebase's `signInWithPopup()` opens a browser popup, which does not work reliably inside
a Capacitor WebView on Android. Native Google Sign-In uses Google Play Services directly,
opening Android's native account picker.

### Platform conditional

```typescript
// src/services/auth.service.ts
if (Capacitor.isNativePlatform()) {
  // Native path: opens Android account picker
  const { authentication } = await GoogleAuth.signIn();
  const credential = GoogleAuthProvider.credential(authentication.idToken);
  await signInWithCredential(firebaseAuth, credential);
} else {
  // Web path: Firebase popup (desktop browser)
  await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
}
```

### Peer dependency conflict (Capacitor 8)

`@codetrix-studio/capacitor-google-auth@3.4.0-rc.4` declares a peer dependency on Capacitor 6,
but the project uses Capacitor 8. The plugin works correctly with Capacitor 8 in practice
(validated on physical Android device). The conflict only affects `npm install`, which must
be run with `--legacy-peer-deps` for any install/update involving this package.

```bash
npm install --legacy-peer-deps
# or specifically for this package
npm install @codetrix-studio/capacitor-google-auth --legacy-peer-deps
```

> Do **not** use `--force` as it can silently corrupt transitive dependencies.

### Firebase console requirements

To use native Google Sign-In on Android, the following must be configured in Firebase Console:

1. Add an Android app with the correct package name (`io.ionic.starter`)
2. Add the SHA-1 fingerprint of both debug and release keystores:
   ```bash
   # Debug keystore SHA-1
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
   ```
3. Download and place `google-services.json` at `android/app/google-services.json`
4. In Firebase Console → Authentication → Sign-in providers → Google, enable Google
5. Copy the **Web Client ID** (type: Web, not Android) from Google Cloud Console → Credentials
6. Set it as `VITE_GOOGLE_WEB_CLIENT_ID` in `.env`

### Configuration

```typescript
// capacitor.config.ts
plugins: {
  GoogleAuth: {
    scopes: ['profile', 'email'],
    serverClientId: process.env.VITE_GOOGLE_WEB_CLIENT_ID,
  },
}

// src/main.ts
GoogleAuth.initialize({
  clientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
  scopes: ['profile', 'email'],
  grantOfflineAccess: true,
});
```

---

## Section 8 — Important warnings

### ⚠️ Do NOT recreate the Android platform without a backup

```bash
# DANGEROUS — will erase ALL manual changes
npx cap rm android    # ← DO NOT RUN
npx cap add android   # ← DO NOT RUN without backup
```

These commands regenerate the entire `android/` directory and will destroy:

- `android/app/src/main/java/io/ionic/starter/MainActivity.java` — custom BroadcastReceiver + TaskRemovedService wiring
- `android/app/src/main/java/io/ionic/starter/TaskRemovedService.java` — app-close / task-removal watchdog
- `android/app/src/main/AndroidManifest.xml` — all added permissions and service declarations
- `android/app/google-services.json` — Firebase Android configuration
- `android/app/src/main/res/drawable/ic_stat_audio.xml` — notification icon
- `android/app/src/main/res/mipmap-*/` — generated app icons

### ⚠️ Capacitor upgrade checklist

After running `npm update @capacitor/*`:

1. Diff `android/app/src/main/AndroidManifest.xml` — re-apply permissions from Section 2
2. Check `android/app/src/main/java/io/ionic/starter/MainActivity.java` — Capacitor may regenerate it as an empty class
3. Verify `android/app/build.gradle` — Capacitor may update `compileSdkVersion`/`targetSdkVersion`
4. Run `npx cap sync android` and test on a physical device
5. Re-run `npx capacitor-assets generate --android` if icons are missing

### ⚠️ `--legacy-peer-deps` is intentional

Some packages (`@capacitor/assets`, possibly others in the future) use `--legacy-peer-deps`
to bypass the `@codetrix-studio/capacitor-google-auth` peer dependency declaration for
Capacitor 6. This is intentional and safe. Do **not** remove `--legacy-peer-deps` or attempt
to upgrade `@codetrix-studio/capacitor-google-auth` without testing Google Sign-In on a device.

### ⚠️ `ic_stat_audio` notification icon must be monochrome

The file `android/app/src/main/res/drawable/ic_stat_audio.xml` must be a white-on-transparent
vector drawable. Android 5+ ignores colour in notification icons; a non-monochrome icon will
render as a solid white square.

---

## Section 9 — App close / task removal behavior

**Files changed:**
- `android/app/src/main/java/io/ionic/starter/TaskRemovedService.java` (new)
- `android/app/src/main/java/io/ionic/starter/MainActivity.java` (updated — `onCreate`)
- `android/app/src/main/AndroidManifest.xml` (updated — service registration)

### The problem

The app uses `backgroundPlayback: true` so ExoPlayer (managed by `@capgo/native-audio`)
keeps running when the app backgrounds. This is intentional for use cases like:
- user presses **Home** → vibe continues while using other apps
- screen **locks** → vibe continues overnight

However, when the user **explicitly closes** the app by swiping it away from the recent-apps
list, the same mechanism caused audio to keep playing as a ghost process:

| Event | Before fix | After fix |
|---|---|---|
| Home button | audio continues ✓ | audio continues ✓ |
| Lock screen | audio continues ✓ | audio continues ✓ |
| App switch | audio continues ✓ | audio continues ✓ |
| Swipe from recents | audio continues ✗ | audio stops ✓ |
| Reopen after swipe | Pinia idle, audio still playing ✗ | Pinia idle, audio silent ✓ |

### Why JS-side teardown is not reliable here

When the user swipes the app from recents:
1. Android destroys the `Activity` and its associated WebView
2. The Capacitor JS bridge is torn down
3. `NativeAudio.deinitPlugin()` and `ForegroundService.stopForegroundService()` cannot
   be called reliably — the bridge is gone

### Solution: `TaskRemovedService.java`

`Service.onTaskRemoved(Intent)` is an Android lifecycle callback that fires **only** when
the user explicitly removes a task from the recent-apps list. It is not called on Home press,
lock, or app switch.

A dedicated lightweight service (`TaskRemovedService`) is started from `MainActivity.onCreate()`
with `START_NOT_STICKY`. Its `onTaskRemoved()` calls `android.os.Process.killProcess()`, which:

1. Terminates ExoPlayer (same process as the app)
2. Terminates the `@capawesome` Foreground Service (same process)
3. Android automatically removes the foreground notification
4. Android automatically abandons AudioFocus

```java
// TaskRemovedService.java
@Override
public void onTaskRemoved(Intent rootIntent) {
    Log.d(TAG, "onTaskRemoved — user closed app from recents; stopping audio process");
    android.os.Process.killProcess(android.os.Process.myPid());
    stopSelf();
}
```

### Why killProcess() is safe here

- Home/lock/switch do NOT trigger `onTaskRemoved()` → no risk of killing background audio
- The JS bridge is already destroyed at this point → cannot call JS APIs anyway
- ExoPlayer is in-process → killing the process is the only atomic teardown available
- The OS cleans up all resources (file handles, network connections, audio sessions)

### Manifest registration

```xml
<!-- stopWithTask="false" keeps the service alive past task removal
     so onTaskRemoved() is still called on that event. -->
<service android:name=".TaskRemovedService" android:stopWithTask="false" />
```

### MainActivity wiring

```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    startService(new Intent(this, TaskRemovedService.class));
}
```

---

## Section 10 — Recommended future improvements

### Audio

| Item | Priority | Notes |
|---|---|---|
| Fix loop fade-in starting loud ([#3](https://github.com/lucasbrito90/front_vibes/issues/3)) | High | Root cause in `@capgo/native-audio` Android — may require plugin patch or workaround |
| Custom software ducking | Medium | Replace OS-level ducking with app-controlled volume ramp for smoother blending |
| Offline audio cache | Medium | Pre-cache remote URLs for offline playback; `@capgo/native-audio` partially supports via `clearCache()` |
| Waveform / visualiser | Low | Requires native audio level sampling; no current plugin support |

### Lock screen / controls

| Item | Priority | Notes |
|---|---|---|
| Skip forward/back controls | Low | Not semantically meaningful for ambient audio; could map to next/previous vibe |
| iOS lock screen parity | Medium | Requires testing `@capgo/native-audio` MediaSession behaviour on iOS |

### Architecture

| Item | Priority | Notes |
|---|---|---|
| iOS native Google Sign-In | Medium | `@codetrix-studio/capacitor-google-auth` supports iOS; needs Firebase iOS app registration |
| Staging/production environment switching for native builds | Low | Consider a proper Capacitor environment plugin or build variants |
| Password toggle icon bug ([#4](https://github.com/lucasbrito90/front_vibes/issues/4)) | Medium | Login screen icon does not change state on toggle |
