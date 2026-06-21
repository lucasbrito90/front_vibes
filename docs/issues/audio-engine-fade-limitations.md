# [Audio Engine] Replace or extend native audio engine for reliable fade support

## Status
**Temporarily removed** — fadeIn/fadeOut are not applied at runtime as of the
`remove-fade-and-abstract-audio-engine` feature branch (May 2026).

---

## Problem

`@capgo/native-audio` 8.4.2 does not support reliable fade effects on Android:

### 1. loop() + fadeIn — never worked reliably

- `loop()` has no native fadeIn parameter.
- JS workaround (call `setVolume(ramp)` after `loop()`) failed because the
  Capacitor bridge resolves the promise while ExoPlayer is still in
  `STATE_BUFFERING` — `player.isPlaying()` is `false` at that point.
- The plugin's `setVolume` gated `fadeTo()` on `isPlaying()`, so the ramp was
  silently skipped and audio started at full volume.
- Patching `RemoteAudioAsset.java` to use `getPlayWhenReady()` instead of
  `isPlaying()` allowed the ramp to start, but ExoPlayer would apply volumes
  retroactively when leaving `STATE_BUFFERING`, producing an audible click.
- A `loopWithFadeIn()` native method was added via a postinstall patch script —
  it ran entirely on the Android UI thread (setVolume(0) → setRepeatMode →
  play() → fadeIn steps), which was the correct architecture, but the patch
  mechanism was fragile and added maintenance cost.

### 2. play() + fadeIn — wrong Java dispatch

- `NativeAudio.java` calls `asset.playWithFadeIn(time, volume, fadeInDurationMs)`
  where `fadeInDurationMs` is typed as `double`.
- `RemoteAudioAsset.playWithFadeIn` had the third parameter typed as `float`.
- Java does not auto-narrow `double → float`, so the call dispatched to the
  base-class `AudioAsset.playWithFadeIn(double, float, double)` which accesses
  `audioList.get(0)` — empty for remote assets — causing:
  ```
  CapacitorException: Index 0 out of bounds for length 0
  ```
- Workaround was to stop passing `fadeIn: true` to `play()` and instead use a
  post-play `setVolume(ramp)` — but this suffers from the same STATE_BUFFERING
  race as the loop case.

### 3. Overall plugin coupling

- Every fix required patching Java files in `node_modules` via custom scripts.
- Patches accumulated complexity, were fragile against plugin upgrades, and made
  the codebase harder to maintain.
- The plugin's internal architecture (SoundPool vs ExoPlayer, isComplex flag,
  undocumented JS/Java type contracts) was not designed for extension.

---

## Decision (temporary)

1. **Removed fadeIn/fadeOut from the UI** — the edit modal no longer shows these
   fields. Users cannot configure fades via the app.
2. **Not applied at runtime** — `audio-player.service.ts` starts every layer
   at target volume. `fadeInSeconds` / `fadeOutSeconds` are still stored in the
   DB and TS types (backward compatibility) but are ignored during playback.
3. **Deleted the patch script** — `scripts/patch-native-audio-fade.cjs` and all
   related Java modifications have been removed.

---

## Future solution

### Option A — Custom Capacitor plugin (recommended)

Build a first-party `@ixora/native-audio` plugin that exposes:

```java
// Android — runs entirely on the UI thread, no STATE_BUFFERING race
public void loopWithFadeIn(String assetId, float targetVolume, float fadeInMs) {
    player.setVolume(0f);           // 1. silence before play()
    player.setRepeatMode(ONE);       // 2. loop
    player.play();                   // 3. start (triggers buffering)
    fadeIn(player, fadeInMs, targetVolume); // 4. ramp — getPlayWhenReady()-aware
}
```

The TypeScript interface to target:

```typescript
export interface AudioEngine {
  loopLayer(layer, opts?: { fadeIn?: number }): Promise<void>;
  playLayer(layer, opts?: { fadeIn?: number }): Promise<void>;
  fadeOut(soundId: number, durationSeconds: number): Promise<void>;
  setVolume(soundId: number, volume: number): Promise<void>;
}
```

### Option B — Upgrade @capgo/native-audio

Monitor the plugin for a version that natively supports fadeIn for loop mode
and fixes the `double/float` type mismatch in `playWithFadeIn`.

---

## AudioEngine abstraction

`src/services/audio-engine/` now contains:

- `types.ts` — `AudioEngine` interface (engine-agnostic)
- `native-audio.engine.ts` — current `@capgo/native-audio` adapter
- `index.ts` — barrel export

When implementing Option A above, create a new engine class in this folder and
swap the export in `index.ts`. No changes to `player.store.ts` or the UI will
be needed.

---

## Requirements for future engine

| Feature | Priority | Notes |
|---|---|---|
| loopWithFadeIn | P0 | Must run natively on the UI thread |
| fadeOut for loops | P0 | Ramp down before hard stop |
| once + fadeIn | P1 | No `playWithFadeIn` type mismatch |
| pause/resume fade state | P1 | Reconstruct interrupted fades on resume |
| per-layer gain automation | P2 | For dynamic mixing |
| Android/iOS parity | P2 | iOS has AVAudioPlayer envelope support |
| HTML fallback fades | P2 | Re-enable RAF-based ramps for web/dev |

---

## Related files

- `src/services/audio-engine/types.ts`
- `src/services/audio-engine/native-audio.engine.ts`
- `src/services/audio-player.service.ts`
- `docs/android-native-customizations.md`
- `docs/issues/native-loop-fadein.md` (previous investigation notes)
