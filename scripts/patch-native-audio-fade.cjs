/**
 * patch-native-audio-fade.cjs
 *
 * Postinstall script that patches @capgo/native-audio Android Java source files
 * to add native loopWithFadeIn() support and fix fadeTo/fadeIn during STATE_BUFFERING.
 *
 * ## Why this exists
 *
 * NativeAudio.loop() does not support fadeIn. It calls asset.loop() which only does:
 *   player.setRepeatMode(REPEAT_MODE_ONE); player.play()
 * It does not set volume to 0 and does not call fadeIn().
 *
 * The JS workaround (loop() then setVolume(ramp)) is unreliable:
 *   - loop() resolves the Capacitor bridge immediately after scheduling player.play()
 *     on the Android UI thread — the JS promise settles while the player is still in
 *     STATE_BUFFERING (loading the remote URL from Firebase).
 *   - setVolume bridge calls therefore arrive on the UI thread while
 *     player.isPlaying() == false (Media3 returns false during STATE_BUFFERING).
 *   - The original setVolume() gated fadeTo() on player.isPlaying(), so the fade
 *     was silently skipped and the volume jumped directly to the target.
 *
 * ## What this script patches
 *
 * 1. AudioAsset.java
 *    - Adds loopWithFadeIn(time, volume, fadeInDurationMs) base implementation
 *      (for local/file-backed assets using AudioDispatcher).
 *
 * 2. RemoteAudioAsset.java
 *    - Adds loopWithFadeIn(time, volume, fadeInDurationMs) override that:
 *        · Sets player.setVolume(0f) BEFORE player.play() — no volume flash.
 *        · Calls the private fadeIn() method with getPlayWhenReady()-aware step guard.
 *    - Fixes fadeIn() step guard to allow buffering-phase steps:
 *        (!isPlaying && !getPlayWhenReady) → cancel instead of (!isPlaying) → cancel.
 *    - Fixes fadeIn() step volume application to apply during STATE_BUFFERING.
 *    - Fixes setVolume() fade trigger from isPlaying() to getPlayWhenReady().
 *    - Fixes fadeTo() step guard and volume application the same way.
 *
 * 3. NativeAudio.java
 *    - Updates playOrLoop() to read optional boolean fadeIn, float volume, and
 *      double fadeInDuration params. When fadeIn=true calls asset.loopWithFadeIn().
 *
 * ## Idempotency
 * Each patch section is guarded by a presence check — the script is safe to run
 * multiple times and survives npm/pnpm reinstalls via the postinstall hook.
 *
 * Run automatically via package.json postinstall hook:
 *   "postinstall": "patch-package && node scripts/patch-native-audio-fade.cjs && ..."
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'node_modules', '@capgo', 'native-audio', 'android', 'src', 'main', 'java', 'ee', 'forgr', 'audio');

// ─── helpers ──────────────────────────────────────────────────────────────────

function readFile(rel) {
  const abs = path.join(BASE, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[patch-native-audio-fade] File not found: ${abs}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf8');
}

function writeFile(rel, content) {
  fs.writeFileSync(path.join(BASE, rel), content, 'utf8');
}

function alreadyPatched(content, sentinel) {
  return content.includes(sentinel);
}

// ─── 1. AudioAsset.java — add loopWithFadeIn() ───────────────────────────────

const AUDIO_ASSET = 'AudioAsset.java';
const AUDIO_ASSET_SENTINEL = 'loopWithFadeIn';

let audioAsset = readFile(AUDIO_ASSET);

if (alreadyPatched(audioAsset, AUDIO_ASSET_SENTINEL)) {
  console.log(`[patch-native-audio-fade] AudioAsset.java — already patched, skipping`);
} else {
  // Insert loopWithFadeIn() right after the existing loop() method.
  const anchor = `    public void loop() throws Exception {
        AudioDispatcher audio = audioList.get(playIndex);
        if (audio != null) {
            audio.loop();
            playIndex++;
            playIndex = playIndex % audioList.size();
            startCurrentTimeUpdates(); // Add timer start
        } else {
            throw new Exception("AudioDispatcher is null");
        }
    }`;

  const insertion = `

    /**
     * Start looping from {@code time} with a linear fade-in from 0 to
     * {@code volume} over {@code fadeInDurationMs} milliseconds.
     * Mirrors {@link #playWithFadeIn} but sets REPEAT_MODE so the asset loops.
     * Overridden by RemoteAudioAsset which drives an ExoPlayer directly.
     */
    public void loopWithFadeIn(double time, float volume, double fadeInDurationMs) throws Exception {
        AudioDispatcher audio = audioList.get(playIndex);
        if (audio != null) {
            cancelFade();
            audio.setVolume(0);
            audio.loop();
            playIndex++;
            playIndex = playIndex % audioList.size();
            fadeIn(audio, fadeInDurationMs, volume);
            startCurrentTimeUpdates();
        } else {
            throw new Exception("AudioDispatcher is null");
        }
    }`;

  if (!audioAsset.includes(anchor)) {
    console.error('[patch-native-audio-fade] AudioAsset.java — anchor not found, cannot patch');
    process.exit(1);
  }

  audioAsset = audioAsset.replace(anchor, anchor + insertion);
  writeFile(AUDIO_ASSET, audioAsset);
  console.log('[patch-native-audio-fade] AudioAsset.java — patched ✓');
}

// ─── 2. RemoteAudioAsset.java — loopWithFadeIn + buffering fixes ─────────────

const REMOTE = 'RemoteAudioAsset.java';
const REMOTE_SENTINEL = 'loopWithFadeIn';

let remote = readFile(REMOTE);

if (alreadyPatched(remote, REMOTE_SENTINEL)) {
  console.log(`[patch-native-audio-fade] RemoteAudioAsset.java — already patched, skipping`);
} else {
  // ── 2a. Add loopWithFadeIn() after playWithFadeIn() ─────────────────────
  const playWithFadeInEnd = `        owner
            .getActivity()
            .runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        if (player != null && !player.isPlaying()) {
                            if (time != 0) {
                                player.seekTo(Math.round(time * 1000));
                            }
                            player.setVolume(0);
                            player.play();
                            startCurrentTimeUpdates();
                            fadeIn(player, fadeInDurationMs, volume);
                        }
                    }
                }
            );
    }`;

  const loopWithFadeInMethod = `

    /**
     * Like {@link #loop()} but starts volume at 0 and ramps linearly to
     * {@code volume} over {@code fadeInDurationMs} milliseconds.
     *
     * Runs entirely inside a single runOnUiThread() call:
     *   setVolume(0) → setRepeatMode(ONE) → play() → fadeIn()
     * Volume is 0 before play() touches the AudioTrack — no volume flash.
     * fadeIn() checks getPlayWhenReady() so steps run during STATE_BUFFERING.
     */
    @Override
    public void loopWithFadeIn(double time, float volume, double fadeInDurationMs) throws Exception {
        if (players.isEmpty()) {
            throw new Exception("No ExoPlayer available");
        }

        final ExoPlayer player = players.get(playIndex);
        owner
            .getActivity()
            .runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        if (player == null) return;
                        if (time != 0) {
                            player.seekTo(Math.round(time * 1000));
                        }
                        player.setRepeatMode(Player.REPEAT_MODE_ONE);
                        // Silence first — must happen before play() so ExoPlayer
                        // starts the AudioTrack at 0 rather than the preloaded volume.
                        player.setVolume(0f);
                        player.play();
                        startCurrentTimeUpdates();
                        fadeIn(player, (float) fadeInDurationMs, volume);
                    }
                }
            );
        playIndex = (playIndex + 1) % players.size();
    }`;

  if (!remote.includes(playWithFadeInEnd)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — playWithFadeIn anchor not found');
    process.exit(1);
  }
  remote = remote.replace(playWithFadeInEnd, playWithFadeInEnd + loopWithFadeInMethod);

  // ── 2b. Fix fadeIn() step guard — tolerate STATE_BUFFERING ─────────────
  const fadeInGuardOld = `                    if (fadeState != FadeState.FADE_IN || currentVolume >= targetVolume) {
                        fadeState = FadeState.NONE;
                        cancelFade();
                        logger.debug("Fade in complete at time " + getCurrentPosition());
                        return;
                    }`;

  const fadeInGuardNew = `                    // Cancel if: state changed, target reached, OR player is
                    // neither playing nor intending to play (user-initiated pause/stop).
                    // Kept alive during STATE_BUFFERING (isPlaying=false,
                    // getPlayWhenReady=true) so the fade works for remote assets
                    // that haven't finished loading when loopWithFadeIn is called.
                    boolean cancelled = fadeState != FadeState.FADE_IN
                            || currentVolume >= targetVolume
                            || player == null
                            || (!player.isPlaying() && !player.getPlayWhenReady());
                    if (cancelled) {
                        fadeState = FadeState.NONE;
                        cancelFade();
                        logger.debug("Fade in complete at time " + getCurrentPosition());
                        return;
                    }`;

  if (!remote.includes(fadeInGuardOld)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — fadeIn guard anchor not found');
    process.exit(1);
  }
  remote = remote.replace(fadeInGuardOld, fadeInGuardNew);

  // ── 2c. Fix fadeIn() volume application — tolerate STATE_BUFFERING ──────
  const fadeInApplyOld = `                    owner
                        .getActivity()
                        .runOnUiThread(() -> {
                            if (player != null && player.isPlaying()) {
                                player.setVolume(currentVolume);
                            }
                        });`;

  const fadeInApplyNew = `                    owner
                        .getActivity()
                        .runOnUiThread(() -> {
                            // Apply during buffering too: ExoPlayer queues the
                            // volume and applies it when STATE_READY is reached.
                            if (player != null && (player.isPlaying() || player.getPlayWhenReady())) {
                                player.setVolume(resolvedTargetVolume);
                            }
                        });`;

  if (!remote.includes(fadeInApplyOld)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — fadeIn apply anchor not found');
    process.exit(1);
  }
  remote = remote.replace(fadeInApplyOld, fadeInApplyNew);

  // ── 2d. Fix setVolume() — use getPlayWhenReady() instead of isPlaying() ─
  const setVolumeOld = `                        cancelFade();
                        for (ExoPlayer player : players) {
                            if (player == null) continue;
                            if (player.isPlaying() && duration > 0) {
                                fadeTo(player, (float) duration, volume);
                            } else {
                                player.setVolume(volume);
                            }
                        }`;

  const setVolumeNew = `                        cancelFade();
                        for (ExoPlayer player : players) {
                            if (player == null) continue;
                            // Use getPlayWhenReady() instead of isPlaying() so that fadeTo()
                            // starts even while the player is still in STATE_BUFFERING.
                            boolean intendingToPlay = player.getPlayWhenReady();
                            if (intendingToPlay && duration > 0) {
                                fadeTo(player, (float) duration, volume);
                            } else {
                                player.setVolume(volume);
                            }
                        }`;

  if (!remote.includes(setVolumeOld)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — setVolume anchor not found');
    process.exit(1);
  }
  remote = remote.replace(setVolumeOld, setVolumeNew);

  // ── 2e. Fix fadeTo() step guard — tolerate STATE_BUFFERING ─────────────
  const fadeToGuardOld = `                    if (fadeState != FadeState.FADE_TO || player == null || !player.isPlaying() || currentStep >= steps) {
                        fadeState = FadeState.NONE;
                        cancelFade();
                        logger.debug("Fade to complete at time " + getCurrentPosition());
                        return;
                    }`;

  const fadeToGuardNew = `                    // Cancel if: fade was superseded, player gone, all steps done, or
                    // player is neither playing nor intending to play (user paused/stopped).
                    // Kept alive during STATE_BUFFERING (getPlayWhenReady=true, isPlaying=false).
                    boolean shouldCancel = fadeState != FadeState.FADE_TO
                            || player == null
                            || currentStep >= steps
                            || (!player.isPlaying() && !player.getPlayWhenReady());
                    if (shouldCancel) {
                        fadeState = FadeState.NONE;
                        cancelFade();
                        logger.debug("Fade to complete at time " + getCurrentPosition());
                        return;
                    }`;

  if (!remote.includes(fadeToGuardOld)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — fadeTo guard anchor not found');
    process.exit(1);
  }
  remote = remote.replace(fadeToGuardOld, fadeToGuardNew);

  // ── 2f. Fix fadeTo() volume application — tolerate STATE_BUFFERING ──────
  const fadeToApplyOld = `                                if (player != null && player.isPlaying()) {
                                    player.setVolume(currentVolume);
                                }`;

  const fadeToApplyNew = `                                // Apply during buffering too.
                                if (player != null && (player.isPlaying() || player.getPlayWhenReady())) {
                                    player.setVolume(currentVolume);
                                }`;

  if (!remote.includes(fadeToApplyOld)) {
    console.error('[patch-native-audio-fade] RemoteAudioAsset.java — fadeTo apply anchor not found');
    process.exit(1);
  }
  remote = remote.replace(fadeToApplyOld, fadeToApplyNew);

  writeFile(REMOTE, remote);
  console.log('[patch-native-audio-fade] RemoteAudioAsset.java — patched ✓');
}

// ─── 3. NativeAudio.java — playOrLoop() reads fadeIn params ──────────────────

const NATIVE_AUDIO = 'NativeAudio.java';
const NATIVE_AUDIO_SENTINEL = 'loopWithFadeIn';

let nativeAudio = readFile(NATIVE_AUDIO);

if (alreadyPatched(nativeAudio, NATIVE_AUDIO_SENTINEL)) {
  console.log(`[patch-native-audio-fade] NativeAudio.java — already patched, skipping`);
} else {
  const playOrLoopOld = `                if (asset != null) {
                    if (LOOP.equals(action)) {
                        asset.loop();
                    } else {
                        asset.play(time);
                    }`;

  const playOrLoopNew = `                if (asset != null) {
                    if (LOOP.equals(action)) {
                        // Optional native fadeIn for loop mode.
                        // JS passes: fadeIn=true, volume=<0-1>, fadeInDuration=<seconds>
                        boolean fadeIn = Boolean.TRUE.equals(call.getBoolean("fadeIn", false));
                        if (fadeIn) {
                            float volume         = call.getFloat(VOLUME, 1.0f);
                            double fadeInSecs    = call.getDouble("fadeInDuration", 1.0);
                            double fadeInMs      = fadeInSecs * 1000.0;
                            Log.d(TAG, "loopWithFadeIn: vol=" + volume + " fadeInDuration=" + fadeInSecs + "s");
                            asset.loopWithFadeIn(time, volume, fadeInMs);
                        } else {
                            asset.loop();
                        }
                    } else {
                        asset.play(time);
                    }`;

  if (!nativeAudio.includes(playOrLoopOld)) {
    console.error('[patch-native-audio-fade] NativeAudio.java — playOrLoop anchor not found');
    process.exit(1);
  }

  nativeAudio = nativeAudio.replace(playOrLoopOld, playOrLoopNew);
  writeFile(NATIVE_AUDIO, nativeAudio);
  console.log('[patch-native-audio-fade] NativeAudio.java — patched ✓');
}

console.log('[patch-native-audio-fade] Done.');
