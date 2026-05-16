# Audio Cache — Ixora

## Overview

Two separate mechanisms apply:

1. **ExoPlayer streaming cache** — Automatic, progressive buffering into a 100 MiB LRU disk cache while playing remote HTTPS audio. This improves repeat playback **after** you have streamed online; it does **not** guarantee the full file exists on disk.

2. **Download for offline** — Explicit full-file download via `fetch` + `@capacitor/filesystem` into `Directory.Data`. Playback resolves to a local `file://` URI when the stored manifest entry matches the current remote URL.

---

## ExoPlayer streaming cache (Android)

Used transparently by `@capgo/native-audio` for non-HLS HTTPS URLs (`RemoteAudioAsset`).

### Important limitation

`prepare()` / initial buffering only pulls enough data to reach `STATE_READY` and keep playback smooth — **not necessarily the entire file**. Therefore:

- Offline playback after **only** streaming (without using **Download for offline**) may work if enough of the file was buffered and not evicted — but this is **best-effort**, not guaranteed.

### Cache engine

| Property | Value |
|---|---|
| Implementation | ExoPlayer `SimpleCache` + `CacheDataSource` + `LeastRecentlyUsedCacheEvictor` |
| Max size | **100 MiB** |
| Location | `Context.getCacheDir()/media` |

### clearAudioCache()

`audioEngine.clearAudioCache()` releases this cache and deletes `getCacheDir()/media`.

It does **not** delete offline downloads under `Directory.Data/offline_audio/`.

---

## Download for offline (guaranteed full file)

### Implementation

| Step | What happens |
|---|---|
| Download | `fetch(layer.fileUrl)` → blob → base64 → `Filesystem.writeFile` under `Directory.Data` |
| Manifest | `@capacitor/preferences` key `ixora_offline_audio_manifest_v1` maps `vibeId:soundId` → `{ relativePath, remoteUrl, savedAt }` |
| Playback | `audioEngine.resolvePlaybackAssetUrl(layer, vibeId)` returns `Filesystem.getUri(...)` when `remoteUrl === layer.fileUrl` and the file still exists |
| Native preload | `audio-player.service.ts` passes the resolved URI with `isUrl: true` → NativeAudio loads `file://` via `ParcelFileDescriptor` (not `RemoteAudioAsset`) |

Files are stored under paths like:

`offline_audio/vibe_{vibeId}/sound_{soundId}.{ext}`

### UI entry point

The three-dot menu (⋮) on **VibePlayerPage** → **Download for offline** calls `playerStore.cacheVibeAudio(vibeId, executionPlan)`.

### Matching remote URLs

If Firebase Storage returns a **new** signed URL for the same sound, the manifest entry no longer matches `layer.fileUrl` and playback falls back to HTTPS until the user downloads again.

---

## Testing offline (Android)

**Do not validate real offline behaviour with `ionic capacitor run android -l` (live reload / Vite dev server).** The WebView still expects the dev server; behaviour is not representative of a production install.

Use a **production or non-live-reload** binary, for example:

```bash
ionic capacitor run android --no-sync --external
# (without -l), or build APK/AAB and install
```

Then:

1. Clear ExoPlayer cache in Settings (optional).
2. Open a vibe online → **Download for offline**.
3. Enable airplane mode.
4. Play the vibe — audio should load from `file://`.

---

## API summary

All capabilities go through `AudioEngine` / `audioEngine` — do not call `NativeAudio.clearCache()` from UI or stores.

```typescript
import { audioEngine } from '@/services/audio-engine';

await audioEngine.clearAudioCache(); // ExoPlayer cache only

const result = await audioEngine.cacheVibeAudio(vibeId, layers); // full-file download (native)

await audioEngine.resolvePlaybackAssetUrl(layer, vibeId); // used internally by audio-player.service
```

Pinia sets `audioPlayerService.setPlaybackVibeContext(vibeId)` whenever vibe context is set so preloads resolve offline paths correctly.

---

## Logs

Prefix `[AudioCache]`:

```
[AudioCache] cacheVibeAudio — started { vibeId, layerCount }
[AudioCache] download requested { vibeId, soundId }
[AudioCache] download — saved { vibeId, soundId, relativePath }
[AudioCache] download — failed { vibeId, soundId, error }
[AudioCache] playback resolve — using offline file { vibeId, soundId }
[AudioCache] clear — started / success / failed
```

---

## Settings UI

**Clear audio cache** clears only the ExoPlayer `SimpleCache` (`getCacheDir()/media`). Offline files in `Directory.Data` remain until overwritten by a new download or app uninstall.

---

## adb debugging

```bash
adb logcat | grep -i "AudioCache"

# ExoPlayer streaming cache
adb shell du -sh /data/data/io.ionic.starter/cache/media

# Offline downloads (path varies by applicationId)
adb shell run-as io.ionic.starter ls -la files/offline_audio/
```

---

## Relevant source files

| File | Role |
|---|---|
| `src/services/audio-engine/offline-audio-storage.ts` | Fetch + Filesystem + manifest + URI resolution |
| `src/services/audio-engine/native-audio.engine.ts` | `cacheVibeAudio`, `resolvePlaybackAssetUrl`, `clearAudioCache`, `getCacheInfo` |
| `src/services/audio-engine/types.ts` | `AudioEngine` interface |
| `src/services/audio-player.service.ts` | Per-layer preload uses `_resolvedAssetPath()` + `setPlaybackVibeContext` |
| `src/stores/player.store.ts` | Syncs playback vibe id with audio service |
| `src/views/VibePlayerPage.vue` | Download for offline |
| `src/views/SettingsPage.vue` | Clear ExoPlayer cache |
| `@capgo/native-audio` … `RemoteAudioAsset.java` | ExoPlayer SimpleCache |
