# Native offline MiniPlayer QA (Android)

Stable **WebdriverIO + Appium** checklist for offline download, playback, and MiniPlayer.  
Spec: `qa-android-native/offline-native-qa.spec.ts`  
WDIO entry: `wdio.android.offline-qa.conf.ts`

## Prerequisites

1. **`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`** — Firebase email/password auth (exported in your shell **or** a local `.env`; never commit passwords).
2. **Laravel user row** — sign in once on the device so `POST /api/auth/sync` creates `users.email` matching `E2E_USER_EMAIL`.
3. **Fixture data** — from `back_vibes`, against the API your APK uses:

   ```bash
   cd ../back_vibes   # sibling of front_vibes
   php artisan ixora:seed-native-offline-qa --email="your-fixture-email@example.com"
   ```

   Optional env (see `back_vibes/.env.example`):

   - `NATIVE_QA_FIXTURE_USER_EMAIL` — default email if you omit `--email`
   - `NATIVE_QA_FIXTURE_SOUND_URL_A` / `NATIVE_QA_FIXTURE_SOUND_URL_B` — HTTPS MP3s (defaults: SoundHelix public samples)

This creates:

| Vibe | Layers |
| --- | --- |
| `__Ixora Native QA Offline Primary` | 2 |
| `__Ixora Native QA Offline Alternate` | 1 |

**Recommendation:** Use a Firebase account dedicated to QA so vibes list ordering stays predictable (`latest()` on the API). Mixing fixtures with dozens of manual vibes pushes them off the first page of results.

## Timeouts

- `OFFLINE_QA_VIBES_TIMEOUT_MS` (default `120000`) — wait for `/vibes` `.vibe-card` after loading (cold API, slow device).

If the wait fails, the spec saves a screenshot `failure-no-vibe-cards-diagnostic-*.png` and throws a message that includes `app-empty-state` / `app-error-state` detection plus a short body snippet.

## Empty `/vibes` diagnostics

When sign-in works but no `.vibe-card` appears, compare:

| Signal | Where |
| --- | --- |
| **API the APK calls** | `VITE_API_BASE_URL` (Player Debug Harness on web dev, or native bridge — see below) |
| **Firebase email in the WebView** | `[offline-qa]` log line `firebaseEmail` inside `Native QA identity snapshot` |
| **Laravel row after `/api/auth/sync`** | Same log: `laravelSynced` `{ id, email, firebase_uid }` |
| **Authoritative counts on the API** | `GET /api/debug/me` (Bearer Firebase ID token) — **non-production Laravel only**, route omitted when `APP_ENV=production` |

### Native QA WebView bridge (optional APK builds)

Rebuild with `VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true` so the runtime exposes `globalThis.__IXORA_NATIVE_QA__` (`apiBaseUrl`, Firebase/Laravel getters, `fetchBackendDebugMe()`). Omit this flag from store / primary production builds — it never attaches the raw token string to `window`, only uses it inside `fetch` to the gated endpoint.

### WDIO vibes list probes (`.vibe-card` timeout)

Logs `[vibes-qa:after-nav]` and `[vibes-qa:timeout]` with:

- **`domProbe`** — path, clipped `document.body.innerText`, hints for loading / empty / error copy, `.vibe-card` counts on `document` vs **shadow-root walk** (`*CountDeep`), the same for `[data-testid="vibe-card"]`, plus `.vibes-list` / empty / error markers.
- **`apiVibesProbe`** — only when diagnostics are enabled on the APK: Laravel `GET /api/vibes` status and **`data` array length** (preview of JSON body truncated), to compare against `/api/debug/me` → `vibes_count`.

## Run

```bash
cd front_vibes
export E2E_USER_EMAIL=...
export E2E_USER_PASSWORD=...

# APK must match your environment (staging API, no VITE_E2E_MOCK_AUTH for real auth).
npm run android:apk:debug   # after build + cap sync

npx wdio run wdio.android.offline-qa.conf.ts
```

Shortcut:

```bash
npm run test:native-offline-qa:android
```

Artifacts: `qa-android-native/output/offline-qa/`.

## Production safety

`ixora:seed-native-offline-qa` refuses `APP_ENV=production` unless you pass `--force` and confirm the prompt.
