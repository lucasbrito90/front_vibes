# Audio Cache — Ixora

## Overview

Several mechanisms apply:

1. **ExoPlayer streaming cache** — Automatic, progressive buffering into a 100 MiB LRU disk cache while playing remote HTTPS audio. This improves repeat playback **after** you have streamed online; it does **not** guarantee the full file exists on disk.

2. **Download for offline (audio files)** — Explicit full-file download via **`CapacitorHttp.request()`** (native HTTP on Android/iOS, **no WebView CORS**) + `@capacitor/filesystem` into `Directory.Data`. Response body is handled as **base64** (native layer for `responseType: 'blob'`) written with `Filesystem.writeFile` **without** `encoding`, so bytes are not interpreted as UTF-8 text. Playback resolves to a local `file://` URI when the manifest entry matches the current remote URL.

3. **Vibe metadata offline snapshot** — `@capacitor/preferences` key **`offline_vibe_manifest_v1`** stores a minimal copy of the vibe record plus the **`VibeSound[]`** returned by `GET /api/vibes/:id/sounds`, written only after a **successful** “Download for offline” (no failed layers). Without this, the player page would call the API on every visit; offline, those calls fail and the execution plan stays empty even though audio files exist under `Directory.Data`.

---

## Why not WebView `fetch()`?

The Capacitor WebView origin is typically **`https://localhost`**. Firebase Storage only sends `Access-Control-Allow-Origin` for configured web origins; unauthenticated GET from `localhost` often fails with:

`No 'Access-Control-Allow-Origin' header is present`

**`CapacitorHttp.request()`** runs the HTTP client on the **native** side, outside the browser CORS policy. We intentionally **do not** use `NativeAudio.preload()` as a download primitive — it does not guarantee a complete file on disk (see ExoPlayer progressive cache above).

### CapacitorHttp config (`capacitor.config.ts`)

Setting `plugins.CapacitorHttp.enabled: true` patches **global** `window.fetch` / `XMLHttpRequest` to native implementations. **It is not required** for offline downloads: we call `CapacitorHttp.request()` explicitly, which already uses native HTTP. The project keeps `enabled: false` unless you need patched fetch app-wide.

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
| Download | `CapacitorHttp.request({ url, method: 'GET', responseType: 'blob' })` → on Android/iOS the native plugin returns the body as a **base64 string** → `Filesystem.writeFile` (no `encoding`; binary-safe decode on disk) |
| Manifest | `@capacitor/preferences` key `ixora_offline_audio_manifest_v1` maps `vibeId:soundId` → `{ relativePath, remoteUrl, savedAt }` |
| Playback | `audioEngine.resolvePlaybackAssetUrl(layer, vibeId)` returns `Filesystem.getUri(...)` when `remoteUrl === layer.fileUrl` and the file still exists |
| Native preload | **Playback only** — `audio-player.service.ts` passes the resolved URI with `isUrl: true` → NativeAudio loads `file://` via `ParcelFileDescriptor` when offline copy exists; otherwise HTTPS URLs still use `RemoteAudioAsset` + transparent SimpleCache |

Files are stored under paths like:

`offline_audio/vibe_{vibeId}/sound_{soundId}.{ext}`

### UI entry point

The three-dot menu (⋮) on **VibePlayerPage** → **Download for offline** calls `playerStore.cacheVibeAudio(vibeId, executionPlan)`.

### Matching remote URLs

If Firebase Storage returns a **new** signed URL for the same sound, the manifest entry no longer matches `layer.fileUrl` and playback falls back to HTTPS until the user downloads again.

---

## Audio file cache vs vibe metadata snapshot

| | **Audio files** (`ixora_offline_audio_manifest_v1` + `offline_audio/`) | **Metadata snapshot** (`offline_vibe_manifest_v1`) |
|---|---|---|
| **What** | Full audio bytes per layer; maps `vibeId:soundId` → local path + remote URL | JSON: vibe fields for UI + `VibeSound[]` to rebuild `executionPlan` |
| **When written** | During **Download for offline** per playable HTTPS layer | After the same download completes with **`failed === 0`** and at least one success |
| **Why** | Guarantees `file://` playback when offline | Lets **VibePlayerPage** hydrate without `GET /api/vibes/:id` or `/sounds` |

### Where metadata is stored

Single Preferences document: **`offline_vibe_manifest_v1`**, shape `{ version: 1, vibes: { "<vibeId>": { vibeId, downloadedAt, vibe, vibeSounds } } }`.

### How the player chooses API vs snapshot

On mount, **VibePlayerPage** loads vibe detail and sounds in parallel (same as online). If **`vibeSounds.length > 0`** after that, it builds the plan from the API. If sounds are **missing** (network error, offline, etc.), it calls **`getOfflineVibeSnapshot(vibeId)`**. If a snapshot exists with sounds, it hydrates **`selectedVibe`** and **`vibeSounds`**, then **`buildPlan()`**. If there is no snapshot and **`navigator.onLine`** is false, it shows a toast: **“This vibe is not available offline.”** When the device is online but the API returns no sounds and there is no snapshot, the page behaves like an empty vibe (warning text only — no toast).

### How Play stays enabled offline

**Play** depends on **`hasPlayableLayers`** (derived from **`executionPlan`**), not on network status. Restoring **`vibeSounds`** from the snapshot repopulates the plan the same way as a successful API response, so **`canUsePlaybackControls`** becomes true when layers resolve to playable URLs (including **`file://`** after **`resolvePlaybackAssetUrl`**).

### Limitations

- Snapshot is **not** updated when the vibe changes on the server until the user runs **Download for offline** again successfully.
- List/browse screens still need network unless separately cached; only the **player** for a **previously downloaded** vibe is supported offline.
- Clearing app data removes Preferences and offline files; both manifests must be repopulated by downloading again.

---

## Testing offline (Android)

**Do not validate real offline behaviour with `ionic capacitor run android -l` (live reload / Vite dev server).** The WebView still expects the dev server; behaviour is not representative of a production install.

Use a **real installable build** — **not** live reload:

```bash
ionic build
npx cap sync android
npx cap run android
```

Avoid:

```bash
ionic capacitor run android -l --external
```

Live reload keeps the dev server in the loop and is **unsuitable** for validating offline playback and native HTTP download behaviour.

Then:

1. Clear ExoPlayer cache in Settings (optional).
2. Online: open a vibe → **Download for offline** → wait for success.
3. Enable airplane mode.
4. Tap stop (if playing), leave the player screen, then open the **same** vibe again — you should see **Offline mode**, **Play** enabled, and the execution plan restored from the snapshot (check DEV panel if needed).
5. Tap **Play** — audio should load from `file://`.
6. Optional: open a vibe that was **never** downloaded while still offline — **Play** should stay disabled and you should see **This vibe is not available offline**.
7. Disable airplane mode — API loads should work again as usual.

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
[AudioCache] native download started …
[AudioCache] native download success …
[AudioCache] native download failed …
[AudioCache] file saved — writing …
[AudioCache] manifest updated …
[AudioCache] local URI resolved …
```

Prefix `[OfflineVibe]` (metadata snapshot):

```
[OfflineVibe] snapshot saved …
[OfflineVibe] snapshot removed …
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
| `src/services/audio-engine/offline-audio-storage.ts` | `CapacitorHttp` + Filesystem + manifest + URI resolution |
| `src/services/audio-engine/native-audio.engine.ts` | `cacheVibeAudio`, `resolvePlaybackAssetUrl`, `clearAudioCache`, `getCacheInfo` |
| `src/services/audio-engine/types.ts` | `AudioEngine` interface |
| `src/services/audio-player.service.ts` | Per-layer preload uses `_resolvedAssetPath()` + `setPlaybackVibeContext` |
| `src/stores/player.store.ts` | Syncs playback vibe id with audio service |
| `src/services/offline-vibe-cache.service.ts` | Preferences snapshot (`offline_vibe_manifest_v1`) |
| `src/views/VibePlayerPage.vue` | Download for offline + offline hydrate on mount |
| `src/views/SettingsPage.vue` | Clear ExoPlayer cache |
| `@capgo/native-audio` … `RemoteAudioAsset.java` | ExoPlayer SimpleCache |
