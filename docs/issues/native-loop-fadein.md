# [Audio] Native fadeIn support for loop playback

**Affected platform:** Android  
**Plugin:** `@capgo/native-audio` (current: `^8.4.2`)  
**Status:** Temporarily disabled — loop layers start at target volume immediately  

---

## Problem

Looping audio layers with `fadeInSeconds > 0` start loudly at the target volume instead of
gradually ramping up from silence. The perceived effect is an abrupt sonic intrusion rather
than a gentle ambient blend-in.

**Reproduction:**
1. Add any sound to a vibe with `play_mode = loop`, `volume = 90%`, `fade_in_seconds = 120`
2. Start the vibe on Android
3. Expected: audio starts near silence and slowly increases over 2 minutes
4. Actual: audio starts immediately at ~90% volume

---

## Root cause

`NativeAudio.loop()` internally calls `asset.loop()` (Java), which only does:

```java
player.setRepeatMode(Player.REPEAT_MODE_ONE);
player.play();
```

It does **not** set the initial volume to 0 and does **not** call any `fadeIn()` method.
Contrast with `NativeAudio.play()`, which supports `fadeIn` by calling
`asset.playWithFadeIn(time, volume, fadeInDurationMs)` — a method that **does** exist in
the plugin.

---

## Attempted workarounds and why they failed

### Workaround 1 — JS setVolume ramp after loop()

```typescript
await NativeAudio.loop({ assetId });
await NativeAudio.setVolume({ assetId, volume: 0.1 });
await NativeAudio.setVolume({ assetId, volume: target, duration: fadeInSeconds });
```

**Failure mode:** `loop()` resolves the Capacitor bridge immediately after *scheduling*
`player.play()` on the Android UI thread. The JS promise settles while ExoPlayer is still
in `STATE_BUFFERING` (loading the remote Firebase URL). Subsequent `setVolume()` calls
arrive while `player.isPlaying() == false` (Media3 returns `false` during `STATE_BUFFERING`),
so `fadeTo()` is silently skipped and the volume jumps directly to the target.

### Workaround 2 — patch setVolume() to use getPlayWhenReady()

Modified `RemoteAudioAsset.setVolume()` to gate fade on `player.getPlayWhenReady()` instead
of `player.isPlaying()`, and patched `fadeTo()` step guard similarly.

**Failure mode:** Even with this fix, there is a bridge round-trip race. The JS ramp
`setVolume` arrives *after* the preloaded volume has already been applied to the
Android AudioTrack, resulting in an audible flash at the preloaded volume level before
the ramp takes effect.

### Workaround 3 — loopWithFadeIn() native patch

Added a new Java method `RemoteAudioAsset.loopWithFadeIn()` that runs entirely on the
UI thread:

```java
player.setRepeatMode(Player.REPEAT_MODE_ONE);
player.setVolume(0f);          // silence BEFORE play()
player.play();
fadeIn(player, durationMs, volume);
```

Updated `NativeAudio.java` to read optional `fadeIn` / `volume` / `fadeInDuration` params
and dispatch to `loopWithFadeIn()`. Updated the TS layer to pass these params.

**Failure mode:** While architecturally correct, this was implemented as a
`node_modules` patch via a postinstall script (`scripts/patch-native-audio-fade.cjs`).
The patch caused an Android build failure (75 Java compilation errors) due to a test
script accidentally truncating `AudioAsset.java`. After fixing the file, further testing
was abandoned due to the fragility of `node_modules` patching in CI/CD, and the
unresolved question of whether `STATE_BUFFERING` volume pre-application still causes
an audible flash even with the in-thread approach.

---

## Current temporary decision

FadeIn is **disabled at runtime** for `loop` playback mode:

- UI (`VibeSoundEditModal.vue`): the Fade-in control is hidden when `play_mode === 'loop'`
- Engine (`audio-player.service.ts`): loop layers always start at `targetVol`, ignoring
  `layer.fadeInSeconds`
- Database: `fade_in_seconds` value is **preserved** for future use — only runtime
  application is skipped

---

## Desired native architecture (future solution)

The correct long-term fix is a **custom Capacitor plugin** (or a contribution upstream to
`@capgo/native-audio`) that implements:

```java
// In RemoteAudioAsset.java (or a custom plugin class)
public void loopWithFadeIn(double time, float targetVolume, float fadeInDurationMs) {
    runOnUiThread(() -> {
        ExoPlayer player = getActivePlayer();
        if (time != 0) player.seekTo(Math.round(time * 1000));
        player.setRepeatMode(Player.REPEAT_MODE_ONE);
        player.setVolume(0f);          // MUST happen before play()
        player.play();
        startCurrentTimeUpdates();
        fadeIn(player, fadeInDurationMs, targetVolume);
    });
}
```

And the corresponding JS bridge method:

```typescript
NativeAudio.loop({
  assetId,
  volume:         targetVol,   // 0–1
  fadeIn:         true,
  fadeInDuration: fadeInSeconds,
});
```

**Key requirements for the native implementation:**
- Volume must be set to 0 *synchronously on the UI thread* before `player.play()`
- `fadeIn()` steps must check `player.getPlayWhenReady()` (not `player.isPlaying()`) so
  they execute during `STATE_BUFFERING` — ExoPlayer buffers the volume and applies it
  when `STATE_READY` is reached
- The method must be atomic (no bridge round-trips between setVolume(0) and play())

---

## Files involved in past workaround attempts

| File | Role |
|---|---|
| `node_modules/@capgo/native-audio/android/.../RemoteAudioAsset.java` | Core fade + playback logic |
| `node_modules/@capgo/native-audio/android/.../AudioAsset.java` | Base class (must define `loopWithFadeIn` abstract/default) |
| `node_modules/@capgo/native-audio/android/.../NativeAudio.java` | Bridge — dispatches JS calls to asset methods |
| `scripts/patch-native-audio-fade.cjs` | Postinstall script that applied the patches |
| `src/services/audio-player.service.ts` | TS engine — `_startLoopAudioNative()` |

---

## Related

- `docs/android-native-customizations.md` — known Android native limitations section
- `scripts/patch-native-audio-fade.cjs` — retained in repo for reference; patches are
  applied but the TS layer no longer invokes `loopWithFadeIn`
