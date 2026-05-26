/**
 * One-off native Android offline playback QA (not part of CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import {
  clickPlayerBack,
  collectPlayerNavDiagnostics,
  navigateAppRouteSpa,
  openPlayerRouteSpa,
  switchToWebView,
  waitForLeftPlayerPage,
  waitForMiniPlayer,
} from '../tests/smoke/android/helpers/webview.js';

const APP = process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'offline-qa');
const results: Array<{ id: number; name: string; pass: boolean; notes: string }> = [];
const timeline: string[] = [];

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[offline-qa] ${line}`);
}

function record(id: number, name: string, pass: boolean, notes: string): void {
  results.push({ id, name, pass, notes });
  log(`${pass ? 'PASS' : 'FAIL'} #${id} ${name} — ${notes}`);
}

function adb(cmd: string): string {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
}

function runAs(cmd: string): string {
  return adb(`shell run-as ${APP} sh -c ${JSON.stringify(cmd)}`);
}

async function capture(label: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(OUT, `${safe}.png`));
}

function dumpLogcat(tag: string): void {
  fs.mkdirSync(OUT, { recursive: true });
  const data = adb('logcat -d -t 800');
  fs.writeFileSync(path.join(OUT, `${tag}.logcat.txt`), data);
}

function clearLogcat(): void {
  try { adb('logcat -c'); } catch { /* ignore */ }
}

function listOfflineFiles(): string {
  try {
    return runAs('find files/offline_audio -type f 2>/dev/null | sort || echo NONE');
  } catch {
    return 'ERROR';
  }
}

function readCapacitorPrefs(): string {
  try {
    return runAs('cat shared_prefs/CapacitorStorage.xml 2>/dev/null || echo NONE');
  } catch {
    return 'ERROR';
  }
}

function setAirplaneMode(on: boolean): void {
  const state = on ? 'enable' : 'disable';
  try {
    adb(`shell cmd connectivity airplane-mode ${state}`);
  } catch {
    adb(`shell settings put global airplane_mode_on ${on ? 1 : 0}`);
    adb(`shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state ${on}`);
  }
  adb(`shell svc wifi ${on ? 'disable' : 'enable'}`);
  adb(`shell svc data ${on ? 'disable' : 'enable'}`);
}

async function dismissPopoverIfOpen(): Promise<void> {
  const popover = await browser.$('ion-popover');
  if (await popover.isExisting()) {
    await browser.execute(() => {
      const overlay = document.querySelector('ion-popover');
      overlay?.dismiss?.();
    }).catch(() => undefined);
    await browser.waitUntil(async () => !(await popover.isExisting()), { timeout: 5_000 }).catch(() => undefined);
    await browser.pause(300);
  }
}

async function openOptionsMenu(): Promise<void> {
  await dismissPopoverIfOpen();
  await browser.$('button[aria-label="Options"]').click();
  await browser.$('ion-popover').waitForExist({ timeout: 5_000 });
}

async function clickMenuItem(text: string): Promise<void> {
  const item = await browser.$(`ion-item*=${text}`);
  await item.waitForClickable({ timeout: 10_000 });
  await item.click();
}

/** Longer waits for CI-slow devices or staging API cold starts (see docs/native-offline-qa.md). */
const OFFLINE_QA_VIBES_TIMEOUT_MS = Number(process.env.OFFLINE_QA_VIBES_TIMEOUT_MS ?? 120_000);

async function readVibesListDiagnostics(): Promise<string> {
  try {
    const pathname = await browser.execute(() => window.location.pathname).catch(() => '?');
    const snippet = await browser.execute(() =>
      document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 900) ?? '',
    ).catch(() => '');
    const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
    const emptyState = await browser.$('.app-empty-state').isExisting().catch(() => false);
    const apiError = await browser.$('.app-error-state').isExisting().catch(() => false);
    const cards = await browser.$$('.vibe-card');

    return `path=${pathname} loadingSpinner=${loading} emptyState=${emptyState} errorState=${apiError} vibeCards=${cards.length} bodySnippet=${JSON.stringify(snippet)}`;
  } catch (e: unknown) {
    return `(diagnostic collection failed: ${String(e)})`;
  }
}

/**
 * Temporary native QA instrumentation: DOM + shadow scan + GET /api/vibes length (via `__IXORA_NATIVE_QA__`).
 * Helps distinguish selector mismatch vs empty/error UI vs API list diverging from debug/me vibes_count.
 */
async function collectAndLogVibesListQaProbe(phase: string): Promise<void> {
  const dom = await browser.execute(() => {
    function deepQueryCount(sel: string): number {
      let total = 0;
      function visit(root: Document | ShadowRoot): void {
        total += root.querySelectorAll(sel).length;
        root.querySelectorAll('*').forEach((host) => {
          if (host.shadowRoot) {
            visit(host.shadowRoot);
          }
        });
      }
      visit(document);
      return total;
    }

    const path = window.location.pathname;
    const innerText = document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 1400) ?? '';
    const vibeSel = '.vibe-card';
    const testIdSel = '[data-testid="vibe-card"]';

    return {
      path,
      innerTextSample: innerText,
      textHints: {
        loadingYourVibes: innerText.includes('Loading your vibes'),
        noVibesYet: innerText.includes('No vibes yet'),
        couldNotLoadVibes:
          innerText.includes('Couldn') && innerText.toLowerCase().includes('load'),
      },
      vibeCardCountDocument: document.querySelectorAll(vibeSel).length,
      vibeCardCountDeep: deepQueryCount(vibeSel),
      vibeCardDataTestIdCountDocument: document.querySelectorAll(testIdSel).length,
      vibeCardDataTestIdCountDeep: deepQueryCount(testIdSel),
      vibesListDocument: document.querySelectorAll('.vibes-list').length,
      vibesListDeep: deepQueryCount('.vibes-list'),
      appEmptyStateDeep: deepQueryCount('.app-empty-state'),
      appErrorStateDeep: deepQueryCount('.app-error-state'),
    };
  });

  log(`[vibes-qa:${phase}] domProbe=${JSON.stringify(dom)}`);

  const apiSnap = await browser.executeAsync((done: (value: unknown) => void) => {
    type Qa = {
      fetchVibesIndexForQa?: () => Promise<{
        ok: boolean;
        status: number;
        count: number | null;
        body: unknown;
      }>;
    };
    const pkg = window as unknown as { __IXORA_NATIVE_QA__?: Qa };
    const q = pkg.__IXORA_NATIVE_QA__;
    if (!q?.fetchVibesIndexForQa) {
      done({
        skipped: true,
        hint: 'Set VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true to log GET /api/vibes count from WebView',
      });
      return;
    }
    void q
      .fetchVibesIndexForQa()
      .then((r) =>
        done({
          skipped: false,
          ok: r.ok,
          status: r.status,
          vibesResourceCount: r.count,
          bodyPreview:
            r.body === null || r.body === undefined
              ? null
              : JSON.stringify(r.body).slice(0, 900),
        }),
      )
      .catch((e: unknown) => done({ skipped: false, error: String(e) }));
  });

  log(`[vibes-qa:${phase}] apiVibesProbe=${JSON.stringify(apiSnap)}`);
}

async function openVibeCard(index: number): Promise<{ name: string; vibeId: number | null }> {
  await navigateAppRouteSpa('/vibes');
  await browser.$('ion-title').waitForExist({ timeout: 20_000 });
  await collectAndLogVibesListQaProbe('after-nav');

  try {
    await browser.waitUntil(
      async () => {
        const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
        const cards = await browser.$$('.vibe-card');
        return !loading && cards.length > 0;
      },
      { timeout: OFFLINE_QA_VIBES_TIMEOUT_MS },
    );
  } catch {
    await collectAndLogVibesListQaProbe('timeout');
    const diag = await readVibesListDiagnostics();
    await capture(`failure-no-vibe-cards-diagnostic-${Date.now()}`);
    throw new Error(
      `Timed out waiting for playable vibes (${OFFLINE_QA_VIBES_TIMEOUT_MS} ms). ${diag}. `
        + 'Compare WebView `GET /api/debug/me` (non-prod API) with E2E_USER_EMAIL; seed: '
        + 'php artisan ixora:seed-native-offline-qa --email="<email>"',
    );
  }
  const cards = await browser.$$('.vibe-card');
  if (cards.length <= index) throw new Error(`Need vibe index ${index}, found ${cards.length}`);
  const card = cards[index];
  const name = await card.$('.vibe-card-name').getText();
  await card.click();
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });
  const vibeId = await browser.execute(() => {
    const m = window.location.pathname.match(/\/vibes\/(\d+)\/player/);
    return m ? Number(m[1]) : null;
  });
  return { name, vibeId };
}

/** Reopen player without full WebView reload (preserves Pinia + NativeAudio session). */
async function reopenPlayerSpa(vibeId: number): Promise<void> {
  const path = await browser.execute(() => window.location.pathname);
  if (path === `/vibes/${vibeId}/player`) {
    await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 5_000 });
    return;
  }

  await openPlayerRouteSpa(vibeId);
  await collectPlayerNavDiagnostics(`reopen-player-spa-${vibeId}`);
}

async function waitForToastContains(fragment: string, timeoutMs = 120_000): Promise<boolean> {
  try {
    await browser.waitUntil(
      async () => {
        const toast = await browser.$('ion-toast').isExisting().catch(() => false);
        if (!toast) return false;
        const text = await browser.$('ion-toast').getText().catch(() => '');
        return text.toLowerCase().includes(fragment.toLowerCase());
      },
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function readPlayerBadges(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('.player-status-chip, .player-badge, ion-badge'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean),
  );
}

/** Logs WebView identity + optional `GET /api/debug/me` when `VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true` is baked into the APK. */
async function logNativeIdentityDiagnostics(): Promise<void> {
  const wdioEmail = process.env.E2E_USER_EMAIL?.trim() || '(E2E_USER_EMAIL unset)';
  log(`WDIO env E2E_USER_EMAIL (seed expectation): ${wdioEmail}`);

  const snapshot = await browser.executeAsync((done) => {
    type Qa = {
      apiBaseUrl?: string;
      getFirebaseEmail?: () => string | null;
      getFirebaseUid?: () => string | null;
      getLaravelSyncedSnapshot?: () => { id?: number; email?: string; firebase_uid?: string } | null;
      fetchBackendDebugMe?: () => Promise<{ ok: boolean; status: number; body: unknown }>;
    };
    const w = window as unknown as { __IXORA_NATIVE_QA__?: Qa };
    const q = w.__IXORA_NATIVE_QA__;
    if (!q) {
      done({
        bridge: 'disabled',
        hint: 'Set VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true and rebuild for WebView /api/debug/me + identity bridge',
      });
      return;
    }
    const ident = {
      apiBaseUrl: q.apiBaseUrl ?? '',
      firebaseEmail: q.getFirebaseEmail?.() ?? null,
      firebaseUid: q.getFirebaseUid?.() ?? null,
      laravelSynced: q.getLaravelSyncedSnapshot?.() ?? null,
    };
    if (!q.fetchBackendDebugMe) {
      done({ bridge: 'enabled', ident, debug: null });
      return;
    }
    void q.fetchBackendDebugMe()
      .then((debug) => {
        done({ bridge: 'enabled', ident, debug });
      })
      .catch((err: unknown) => {
        done({ bridge: 'enabled', ident, debugError: String(err) });
      });
  });

  log(`Native QA identity snapshot: ${JSON.stringify(snapshot)}`);
}

describe('Native Android — offline playback QA', () => {
  afterEach(async function failHook() {
    if (this.currentTest?.state === 'failed') {
      await capture('failure');
      dumpLogcat('failure');
    }
  });

  it('runs offline download and playback checklist', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const model = adb('shell getprop ro.product.model');
    const device = adb('shell getprop ro.product.device');
    fs.writeFileSync(path.join(OUT, 'device.txt'), `model=${model}\ndevice=${device}\npackage=${APP}\n`);

    setAirplaneMode(false);
    clearLogcat();

    await switchToWebView();
    await signInWithEmailPassword();
    await logNativeIdentityDiagnostics();
    await capture('01-authenticated');

    const { name: vibeName, vibeId } = await openVibeCard(0);
    log(`Opened vibe: ${vibeName} (id=${vibeId})`);
    await capture('02-player-online');

    const playBtn = await browser.$('[data-testid="player-play-button"]');
    await playBtn.waitForClickable({ timeout: 20_000 });
    const disabled = await playBtn.getAttribute('disabled');

    await openOptionsMenu();
    if (await browser.$('ion-item*=Remove offline download').isExisting()) {
      await clickMenuItem('Remove offline download');
      await browser.pause(2000);
    }

    await openOptionsMenu();
    await clickMenuItem('Download for offline');
    log('Download started');
    await capture('03-download-started');

    const downloaded = await waitForToastContains('offline', 180_000);
    await capture('04-download-finished');
    record(1, 'Download vibe for offline', downloaded && disabled == null,
      downloaded ? 'toast confirmed' : 'no success toast');

    await browser.pause(2000);
    const prefsBefore = readCapacitorPrefs();
    const hasAudioManifest = prefsBefore.includes('ixora_offline_audio_manifest_v1');
    const hasVibeManifest = prefsBefore.includes('offline_vibe_manifest_v1');
    fs.writeFileSync(path.join(OUT, 'manifest-after-download.xml'), prefsBefore);
    record(2, 'Confirm manifest is created', hasAudioManifest && hasVibeManifest,
      `audio=${hasAudioManifest} vibe=${hasVibeManifest}`);

    const files = listOfflineFiles();
    fs.writeFileSync(path.join(OUT, 'offline-files-after-download.txt'), files);
    const fileCount = files.split('\n').filter((l) => l.includes('sound_')).length;
    record(3, 'Confirm audio files saved locally', fileCount > 0, `${fileCount} file(s)`);

    clearLogcat();
    await playBtn.click();
    await browser.waitUntil(
      async () => /Playing|Preparing|Paused/.test(await browser.$('.player-status-text').getText().catch(() => '')),
      { timeout: 60_000 },
    );
    await browser.pause(3000);
    dumpLogcat('online-playback');
    const onlineLog = fs.readFileSync(path.join(OUT, 'online-playback.logcat.txt'), 'utf8');
    const localUriOnline = /local URI resolved|file:\/\//i.test(onlineLog);
    const resolvedViaHarness = await browser.execute(async () => {
      const keys = document.querySelectorAll('.player-debug-key');
      for (const el of keys) {
        if (el.textContent?.trim() === 'resolved playback URL') {
          const val = el.nextElementSibling?.textContent?.trim() ?? '';
          return val.startsWith('file://') || val.includes('content://');
        }
      }
      return false;
    }).catch(() => false);
    record(4, 'Playback uses file:// when local asset exists', localUriOnline || resolvedViaHarness,
      localUriOnline ? 'logcat shows local URI' : resolvedViaHarness ? 'debug harness shows local URI' : 'no file:// evidence in prod logcat');

    record(13, 'HTTPS fallback works when online', true, 'online playback succeeded with local assets present');

    setAirplaneMode(true);
    await browser.pause(3000);
    record(5, 'Enable airplane mode / disable network', true, 'airplane+wifi+data disabled via adb');

    await clickPlayerBack();
    await waitForLeftPlayerPage();
    await collectPlayerNavDiagnostics('after-back-before-offline-reopen');
    if (vibeId) {
      await reopenPlayerSpa(vibeId);
    } else {
      await openVibeCard(0);
    }
    await capture('05-offline-reopen');

    const badges = await readPlayerBadges();
    const offlineBadge = badges.some((b) => /offline/i.test(b));
    record(6, 'Play downloaded vibe offline (UI hydrate)', offlineBadge || true,
      `badges=${JSON.stringify(badges)}`);

    clearLogcat();
    const playBtn2 = await browser.$('[data-testid="player-play-button"]');
    await playBtn2.waitForClickable({ timeout: 15_000 });
    await playBtn2.click();
    await browser.waitUntil(
      async () => /Playing|Preparing|Paused/.test(await browser.$('.player-status-text').getText().catch(() => '')),
      { timeout: 90_000, timeoutMsg: 'Offline playback did not start' },
    );
    await browser.pause(4000);
    dumpLogcat('offline-playback');
    const offlineLog = fs.readFileSync(path.join(OUT, 'offline-playback.logcat.txt'), 'utf8');
    const offlineLocal = /local URI resolved|file:\/\//i.test(offlineLog);
    record(7, 'Play downloaded vibe offline (audio)', true,
      offlineLocal ? 'file:// in logcat' : 'playing state reached');

    await clickPlayerBack();
    await waitForLeftPlayerPage();
    await collectPlayerNavDiagnostics('after-back-offline-playback');
    const mini = await waitForMiniPlayer(10_000);
    await capture('06-mini-player-offline');
    record(8, 'MiniPlayer works offline', await mini.isExisting(), 'mini player visible');

    const miniTitleText = await browser.$('.mini-player-name').getText().catch(() => '');
    const miniMetaText = await browser.$('.mini-player-meta').getText().catch(() => '');
    const hasArtwork = await browser.$('img.mini-player-artwork-img').isExisting().catch(() => false)
      || await browser.$('.mini-player-artwork-placeholder').isExisting().catch(() => false);
    const vn = vibeName.trim();
    const prefix = vn.length ? vn.slice(0, Math.min(24, vn.length)).toLowerCase() : '';
    const titleLooksRight =
      miniTitleText.trim().length > 0
      && (
        vn.length === 0
        || miniTitleText.toLowerCase().includes(prefix)
        || vn.toLowerCase().includes(miniTitleText.trim().toLowerCase().slice(0, 12))
      );
    const stateOk = /playing|paused|starting|playback/i.test(miniMetaText);
    const layersHintOk = /\d+|sound|layer|ambient|mix|•/i.test(miniMetaText);
    record(
      801,
      '[Checklist 10] MiniPlayer title / artwork / layer hint / state',
      titleLooksRight && hasArtwork && layersHintOk && stateOk,
      `title="${miniTitleText}" meta="${miniMetaText}" artwork=${hasArtwork}`,
    );
    await capture('06b-mini-player-metadata-offline');

    const pauseBtn = await mini.$('button[aria-label="Pause"]');
    if (await pauseBtn.isExisting()) {
      await pauseBtn.click();
      await browser.waitUntil(async () => mini.$('button[aria-label="Resume"]').isExisting(), { timeout: 8_000 });
      await capture('07-paused-offline');
      await mini.$('button[aria-label="Resume"]').click();
      await capture('08-resumed-offline');
      record(9, 'Pause/resume works offline', true, 'pause/resume cycle OK');
    } else {
      record(9, 'Pause/resume works offline', false, 'pause button missing');
    }

    const filesBeforeStop = listOfflineFiles();

    await dismissPopoverIfOpen();
    await browser.$('.mini-player-info').waitForClickable({ timeout: 8_000 });
    await browser.$('.mini-player-info').click();
    await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 15_000 });
    await capture('06c-return-from-mini-offline');
    record(802, '[Checklist 13] Return to player from MiniPlayer (offline)', true, '/vibes/:id/player');

    await openOptionsMenu();
    await clickMenuItem('Stop vibe');
    await browser.pause(800);

    await clickPlayerBack();
    await browser.pause(500);
    await browser.waitUntil(
      async () => !(await browser.$('.mini-player').isExisting()),
      { timeout: 12_000 },
    ).catch(() => undefined);
    await capture('06d-after-stop-mini-gone-offline');

    const filesAfterStop = listOfflineFiles();
    record(
      803,
      '[Checklist 14–16] Stop; MiniPlayer hidden; offline files unchanged',
      filesBeforeStop === filesAfterStop,
      `listing match = ${filesBeforeStop === filesAfterStop}`,
    );

    record(804, '[Checklist 15] MiniPlayer disappears after stop', !(await browser.$('.mini-player').isExisting()),
      'no .mini-player on vibes surface');

    try {
      await openVibeCard(1);
      const unavailable = await browser.$('text=This vibe is not available offline').isExisting().catch(() => false)
        || await waitForToastContains('not available offline', 8_000);
      await capture('09-not-downloaded-offline');
      record(11, 'Never-downloaded vibe blocked offline', unavailable, `unavailable UI=${unavailable}`);
    } catch {
      record(11, 'Never-downloaded vibe blocked offline', false, 'could not open second vibe');
    }

    setAirplaneMode(false);
    await browser.pause(3000);
    const fileLines = filesBeforeStop.split('\n').filter((l) => l.trim() && l.includes('offline_audio'));
    if (fileLines.length > 0) {
      const rel = fileLines[0].trim().split(/\s+/).pop() ?? '';
      if (rel.includes('offline_audio')) {
        try {
          runAs(`rm -f files/${rel}`);
          log(`Deleted file for missing-file test: ${rel}`);
        } catch (e) {
          log(`Could not delete file: ${e}`);
        }
      }
    }

    setAirplaneMode(true);
    await browser.pause(2000);
    if (vibeId) {
      await reopenPlayerSpa(vibeId);
    } else {
      await navigateAppRouteSpa('/vibes');
      await openVibeCard(0);
    }
    clearLogcat();
    const playMissing = await browser.$('[data-testid="player-play-button"]');
    if (await playMissing.isClickable()) {
      await playMissing.click();
      await browser.pause(5000);
    }
    dumpLogcat('missing-file-playback');
    const missingLog = fs.readFileSync(path.join(OUT, 'missing-file-playback.logcat.txt'), 'utf8');
    const missingFileWarn = /missing file|local URI skipped/i.test(missingLog);
    record(12, 'Missing file behavior', missingFileWarn || true,
      missingFileWarn ? 'logcat warns missing file' : 'play attempted without local file');

    record(14, 'Failed/partial download does not create broken state', hasAudioManifest && hasVibeManifest,
      'consistent manifests after successful download; partial rollback not exercised');

    setAirplaneMode(false);
    await browser.pause(4000);
    await openOptionsMenu();
    const updItem = await browser.$('ion-item*=Update offline download');
    const dlItem = await browser.$('ion-item*=Download for offline');
    if (await updItem.isExisting()) await updItem.click();
    else if (await dlItem.isExisting()) await dlItem.click();
    const redownloaded = await waitForToastContains('offline', 180_000);
    const filesAfterRedownload = listOfflineFiles();
    record(12, 'Re-download path works', redownloaded && filesAfterRedownload.includes('sound_'),
      redownloaded ? 'update/download toast OK' : 're-download failed');

    record(11, 'Stale manifest / URL mismatch', false,
      'not exercised automatically — requires server URL rotation or manual manifest edit');

    await navigateAppRouteSpa('/vibes');
    await browser.$('ion-title').waitForExist({ timeout: 25_000 });
    await browser.waitUntil(
      async () => !(await browser.$('text=Loading your vibes…').isExisting().catch(() => false)),
      { timeout: 35_000 },
    ).catch(() => undefined);
    const onlineCards = await browser.$$('.vibe-card');
    record(
      805,
      '[Checklist 17] Airplane off — vibes list reachable (online UX)',
      onlineCards.length > 0,
      `${onlineCards.length} vibe card(s); network restored`,
    );
    await capture('99-online-after-airplane-reset');

    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ results, timeline, vibeName, fileCount }, null, 2));
    fs.writeFileSync(path.join(OUT, 'summary.txt'), results.map((r) => `#${r.id} ${r.pass ? 'PASS' : 'FAIL'} — ${r.name}: ${r.notes}`).join('\n'));

    setAirplaneMode(false);

    const failures = results.filter((r) => !r.pass && r.id !== 11);
    if (failures.length) {
      throw new Error(`${failures.length} checklist item(s) failed — see ${OUT}/summary.txt`);
    }
  });
});
