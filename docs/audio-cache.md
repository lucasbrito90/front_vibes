# Audio Cache — Ixora

## Overview

The Ixora app uses `@capgo/native-audio` (ExoPlayer on Android) to stream audio from
Firebase Storage. ExoPlayer's built-in disk cache (`SimpleCache`) is wired automatically
for all non-HLS remote HTTPS URLs, providing faster subsequent playback and the foundation
for limited offline use.

---

## How the cache works (Android)

### Cache engine

| Property | Value |
|---|---|
| Implementation | ExoPlayer `SimpleCache` + `CacheDataSource` + `LeastRecentlyUsedCacheEvictor` |
| Max size | **100 MiB** (`MAX_CACHE_SIZE = 100 * 1024 * 1024`) |
| Eviction policy | LRU (Least Recently Used) |
| Location | `Context.getCacheDir()/media` (internal app cache — not accessible to the user) |
| Typical path | `/data/data/io.ionic.starter/cache/media` |

### What gets cached

| URL type | Cached? | How |
|---|---|---|
| Firebase Storage MP3/OGG/WAV (HTTPS) | ✅ Yes | `RemoteAudioAsset` → `CacheDataSource` → `SimpleCache` |
| Any non-HLS `http://` or `https://` URL | ✅ Yes | Same path |
| HLS `.m3u8` streams | ❌ No | `StreamAudioAsset` uses `HlsMediaSource` — bypasses `SimpleCache` |
| Local `file://` assets | ❌ N/A | Not a remote fetch |
| Web platform (`ionic serve`) | ❌ N/A | Browser HTTP cache only |

### When does caching happen?

Caching occurs automatically during `preload()` and `play()`/`loop()` — any time ExoPlayer
reads bytes from the network through `CacheDataSource`. There is no explicit "cache this file"
API; it happens transparently as part of normal audio buffering.

### Does the cache persist between sessions?

**Yes.** Files under `getCacheDir()` survive:
- App backgrounding
- App close and reopen
- Device restart

The cache is evicted by:
- OS storage pressure (Android may clear internal cache when disk is full)
- User or system "Clear Cache" action in Android Settings
- App uninstall
- Calling `audioEngine.clearAudioCache()`

### Does unload() remove cached bytes?

**No.** `unload()` releases only the ExoPlayer instance (`player.release()`). The cached
bytes in `SimpleCache` remain on disk. This is the key property that makes the
preload+unload cache-warming pattern work.

---

## Cache management API

All cache operations go through the `AudioEngine` interface to maintain the abstraction.
**Do not call `NativeAudio.clearCache()` directly from components or stores.**

```typescript
import { audioEngine } from '@/services/audio-engine';

// Get cache metadata (synchronous, no I/O)
const info = audioEngine.getCacheInfo();
// info.hasCacheSupport  → true on Android native
// info.maxSizeBytes     → 104857600 (100 MiB)
// info.location         → 'Android internal cache: getCacheDir()/media ...'

// Clear the entire cache
await audioEngine.clearAudioCache();

// Warm cache for a vibe's layers (preload + immediately unload)
const result = await audioEngine.cacheVibeAudio(vibeId, layers);
// result.succeeded  → number of layers successfully warmed
// result.skipped    → number skipped (non-HTTPS, already active, etc.)
// result.failed     → number of errors
// result.details    → per-layer outcome array
```

### clearAudioCache()

Calls `NativeAudio.clearCache()` which:
1. Calls `SimpleCache.release()` on the static cache instance
2. Sets the static field to `null` (next preload recreates it)
3. Recursively deletes `getCacheDir()/media`

**Safe to call when no audio is currently playing.** Calling while audio is actively
streaming may cause ExoPlayer errors for in-flight reads (the cache backend disappears
mid-stream). The `SettingsPage` UI only exposes this option when no vibe is playing.

### cacheVibeAudio(vibeId, layers)

For each eligible layer (remote HTTPS URL):

1. Generates a **cache-only assetId**: `cache-vibe-{vibeId}-sound-{soundId}`
   — separate namespace from active playback ids (`vibe-layer-{soundId}`)
2. Calls `NativeAudio.preload()` → ExoPlayer buffers through `CacheDataSource`
   → bytes are written to `SimpleCache` on disk
3. Immediately calls `NativeAudio.stop()` + `NativeAudio.unload()` — the
   ExoPlayer instance is released but cached bytes remain
4. Returns the result summary

Layers are processed sequentially (not in parallel) to avoid overwhelming the
Android I/O thread or triggering ExoPlayer resource exhaustion.

---

## Offline behaviour

### Current state (partial offline support)

| Scenario | Behaviour |
|---|---|
| Audio previously streamed in same session | ExoPlayer reads from in-memory buffer — works |
| Audio cached via cacheVibeAudio() or prior playback | ExoPlayer reads from disk cache — likely works |
| Audio never cached, no network | ExoPlayer fails to connect — falls back to HTMLAudioElement (also fails) |
| Firebase Storage signed URL changed since caching | Cache miss — re-download on next play |

### Limitation: signed URL cache keys

Firebase Storage download URLs include a signed access token in the query string.
ExoPlayer uses the **full URL** as the cache key. If the token rotates (e.g. because the
file was re-uploaded or permissions changed), the new URL is a different cache key and
the cached bytes are not reused.

For ambient audio files that rarely change, this is not a significant issue in practice.

### Full offline support — future work

True offline playback requires:
1. Downloading the full audio file before going offline
2. Storing it in a location that is not subject to OS cache eviction
3. Substituting the local file path when the device is offline

This is tracked in `docs/issues/audio-engine-fade-limitations.md` under
"Future additions". The `AudioEngine.cacheVibeAudio()` method is the foundation
for this — a future version would persist files to `getFilesDir()` instead of
relying on the LRU `getCacheDir()`.

---

## Logs

All cache operations log with the `[AudioCache]` prefix:

```
[AudioCache] clear — started
[AudioCache] clear — success
[AudioCache] cacheVibeAudio — started { vibeId, layerCount }
[AudioCache] preload (cache-only) — start { soundId, cacheAssetId }
[AudioCache] cache-only asset unloaded (bytes remain in disk cache) { soundId, cacheAssetId }
[AudioCache] cacheVibeAudio — done { vibeId, succeeded, skipped, failed }
[AudioCache] skip (non-remote URL) { soundId }
[AudioCache] preload (cache-only) — failed { soundId, error }
```

Use `adb logcat -s chromium` or the browser dev-tools console to see these in the
live-reload dev build.

---

## Settings UI

The **Settings** page exposes a "Clear audio cache" button that calls
`audioEngine.clearAudioCache()` via the Pinia player store action `clearAudioCache()`.

The button shows a confirmation alert before proceeding to avoid accidental cache wipes.

---

## adb debugging

```bash
# Watch cache-related logs
adb logcat | grep -i "AudioCache\|SimpleCache\|CacheDataSource"

# Check cache directory size on device
adb shell du -sh /data/data/io.ionic.starter/cache/media

# List cached files
adb shell ls -la /data/data/io.ionic.starter/cache/media/
```

---

## Relevant source files

| File | Role |
|---|---|
| `src/services/audio-engine/types.ts` | `AudioCacheInfo`, `CacheVibeResult`, `AudioEngine` interface |
| `src/services/audio-engine/native-audio.engine.ts` | `clearAudioCache()`, `cacheVibeAudio()`, `getCacheInfo()` |
| `src/services/audio-engine/index.ts` | Public barrel export |
| `src/stores/player.store.ts` | `clearAudioCache()` action (delegates to audioEngine) |
| `src/views/SettingsPage.vue` | "Clear audio cache" UI button |
| `node_modules/@capgo/native-audio/android/.../RemoteAudioAsset.java` | Native cache implementation |
