# Android smoke tests — WebdriverIO + Appium

**Status:** Local-only skeleton (no CI, no device farm)  
**Scope:** `front_vibes` native shell + player route reachability  
**Out of scope:** playback automation, offline filesystem, lock-screen controls

**Related:** [Player test strategy](../../ixora-infra/docs/quality/player-test-strategy.md) · [Playwright web E2E](../tests/e2e/) · [Quality harness](../docs/quality-harness.md)

---

## What this covers

| Step | Assertion |
| --- | --- |
| Launch debug APK | Appium starts `io.ionic.starter/.MainActivity` |
| App shell | `ion-app` exists in Capacitor WebView |
| Open player | WebView navigates to `/vibes/:id/player` (no deep link yet) |
| Player screen | `[data-testid="player-page"]`, “AMBIENT MIX”, play button visible |

Does **not** press Play or validate NativeAudio.

---

## Local Android requirements

### Host machine

| Tool | Version | Notes |
| --- | --- | --- |
| **Node.js** | LTS 18+ / 20+ | Same as `front_vibes` |
| **Java JDK** | 17+ | Android Gradle plugin |
| **Android SDK** | API 34+ (match `compileSdk`) | `ANDROID_HOME` or `ANDROID_SDK_ROOT` set |
| **Platform tools** | `adb` on `PATH` | `adb devices` must list emulator or USB device |
| **Appium 2** | 2.x | Project devDependency — `node_modules/.bin/appium` (no global install) |
| **UiAutomator2 driver** | latest | One-time: `npm run appium:setup` |
| **ChromeDriver** | auto | `chromedriverAutodownload: true` in WDIO config |

Verify Appium (from `front_vibes/`):

```bash
npx appium --version
npx appium driver list --installed   # should include uiautomator2
```

### Device or emulator

- **Emulator** (recommended): API 34+ Google APIs image, x86_64 or arm64.
- **Physical device**: USB debugging enabled; same network as API if you test against a real backend later.

```bash
adb devices
# expect: emulator-5554   device
```

### Debug APK (smoke build)

Smoke tests skip Firebase auth when the Web bundle is built with **`VITE_E2E_MOCK_AUTH=true`** (same flag as Playwright). This is **only** for local smoke APKs — never ship to production.

```bash
cd front_vibes

# 1. Web bundle with E2E auth bypass
VITE_E2E_MOCK_AUTH=true npm run build

# 2. Sync Capacitor Android project
npm run cap:sync:android

# 3. Assemble debug APK
cd android && ./gradlew assembleDebug && cd ..

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

Shortcut script:

```bash
npm run build:android:smoke
npm run android:apk:debug
```

Install on the running device/emulator:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Install WebdriverIO dependencies

From `front_vibes/` (uses `--legacy-peer-deps` like the rest of the repo):

```bash
npm install --legacy-peer-deps
```

First-time Appium driver (once per machine, after `npm install`):

```bash
npm run appium:setup
```

---

## Run smoke tests

Start emulator or connect device, then:

```bash
cd front_vibes
npm run test:smoke:android
```

### Environment overrides

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANDROID_APK_PATH` | `android/app/build/outputs/apk/debug/app-debug.apk` | Custom APK location |
| `ANDROID_APP_PACKAGE` | `io.ionic.starter` | From `capacitor.config.ts` |
| `ANDROID_APP_ACTIVITY` | `.MainActivity` | Launcher activity |
| `ANDROID_DEVICE_NAME` | `Android` | Appium capability label |
| `SMOKE_PLAYER_VIBE_ID` | `42` | Route `/vibes/:id/player` |
| `CAPACITOR_WEB_ORIGIN` | `https://localhost` | Capacitor WebView base URL |

Example:

```bash
SMOKE_PLAYER_VIBE_ID=42 npm run test:smoke:android
```

---

## Navigation strategy

| Method | Status |
| --- | --- |
| **WebView URL** (`https://localhost/vibes/:id/player`) | **Used by smoke skeleton** |
| **Android deep link / intent-filter** | **Not configured** — add later if product needs shareable player links |
| **UI tap-through (Vibes list → player)** | Future smoke; requires auth + seeded backend |

The spec switches to the Capacitor `WEBVIEW_*` context and uses the same Vue routes as the web app.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `WEBVIEW context not found` | APK not installed, app crashed on launch, or WebView not ready — check `adb logcat` |
| `Cannot find app-debug.apk` | Run `npm run android:apk:debug` after `build:android:smoke` |
| Stuck on sign-in | APK built **without** `VITE_E2E_MOCK_AUTH=true` |
| `chromedriver` / context errors | Update Appium + UiAutomator2; ensure one device in `adb devices` |
| Appium not on PATH | Run `npm install --legacy-peer-deps` in `front_vibes`; WDIO uses `node_modules/.bin/appium` |

---

## CI posture

**Not wired.** Run locally before release or after NativeAudio / Android manifest / foreground-service changes. No device farm, no GitHub Actions job in this skeleton.

---

## File layout

```
front_vibes/
  wdio.android.conf.ts
  tests/smoke/android/
    player-reachable.spec.ts
    helpers/webview.ts
  docs/android-smoke-tests.md
```
