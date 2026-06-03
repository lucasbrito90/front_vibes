/**
 * Native Android — media notification / lock-screen QA (partial automation).
 *
 * Automates: play → background → foreground → in-app pause/resume/stop via MiniPlayer.
 * Manual: notification shade / lock-screen transport (see output/manual-checklist.txt).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import {
  clickPlayerBack,
  navigateAppRouteSpa,
  switchToWebView,
  waitForMiniPlayer,
} from '../tests/smoke/android/helpers/webview.js';
import {
  analyzePlaybackLogcat,
  capturePlaybackLogcat,
  clearLogcatBuffer,
} from './helpers/logcat.js';
import {
  analyzeBridgeDesync,
  readPlaybackBridgeSnapshot,
  type PlaybackBridgeSnapshot,
} from './helpers/playback-bridge.js';
import { bringAppToForeground, sendAppToBackground } from './helpers/noisy-audio.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'media-notification-qa');
const timeline: string[] = [];

const MANUAL_CHECKLIST = `
Android media notification — manual QA (device required)
========================================================

Prerequisites:
- Debug APK with VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true (optional, for bridge JSON)
- Playback started (this spec leaves you in a playing or post-test state)
- adb logcat: npm run capture:playback-logcat  OR  adb logcat -s NativeAudio MediaSession Capacitor/NativeAudio

1) Start playback from a vibe with artwork_url set.
2) Background the app (Home). Confirm TWO notifications:
   - MediaStyle (play/pause/stop, vibe title, artwork) — @capgo/native-audio
   - Low-importance "Vibes" keepalive — foreground service
3) Lock screen: verify title matches vibe name; artwork if CDN reachable.
4) Pause from media notification or lock screen.
   - Audio stops; notification shows Pause→Play icon.
   - Foreground app: MiniPlayer shows "Resume"; Pinia playbackState=paused.
5) Resume from notification/lock screen.
   - Audio resumes; MiniPlayer shows "Pause" / Playing after opening app.
6) Pause again from MiniPlayer, then resume from notification (cross-control sync).
7) Stop from notification (if shown) or swipe-stop on lock screen widget.
   - Playback stops; MiniPlayer hidden; keepalive notification dismissed.
   - No stale media notification after ~5s.
8) Repeat steps 1–7 with offline file:// playback if fixtures available.

Logcat signals (automated spec also captures):
- [MediaSession] remotePlay / remotePause / remoteStop
- remoteRewind / remoteFastForward — plugin-only seek, no Pinia change

Intentionally unsupported:
- Next/previous track (no queue)
- remoteRewind/remoteFastForward do not change Pinia (ambient audio)
`.trim();

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[media-notification-qa] ${line}`);
}

async function snapshotStep(step: string): Promise<PlaybackBridgeSnapshot> {
  const snap = await readPlaybackBridgeSnapshot();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `bridge-${step}.json`), JSON.stringify(snap, null, 2));
  const notif = await browser.execute(() => {
    type Qa = { getNotificationContext?: () => { vibeName: string; artworkUrl: string } };
    return (window as unknown as { __IXORA_NATIVE_QA__?: Qa }).__IXORA_NATIVE_QA__?.getNotificationContext?.() ?? null;
  });
  if (notif) {
    fs.writeFileSync(path.join(OUT, `notification-${step}.json`), JSON.stringify(notif, null, 2));
  }
  log(
    `bridge ${step}: store=${snap.store.playbackState} mini=${snap.store.showMiniPlayer} aria=${snap.ui.playPauseAriaLabel || '—'}`,
  );
  return snap;
}

async function openFirstVibeAndPlay(): Promise<string> {
  await navigateAppRouteSpa('/vibes');
  await browser.$('ion-title').waitForExist({ timeout: 20_000 });
  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
      const cards = await browser.$$('.vibe-card');
      return !loading && cards.length > 0;
    },
    { timeout: 90_000, timeoutMsg: 'No vibe cards' },
  );

  const cards = await browser.$$('.vibe-card');
  const name = await cards[0].$('.vibe-card-name').getText();
  await cards[0].click();
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });

  const playBtn = await browser.$('[data-testid="player-play-button"]');
  await playBtn.waitForClickable({ timeout: 15_000 });
  await playBtn.click();

  await browser.waitUntil(
    async () => {
      const status = await browser.$('.player-status-text').getText().catch(() => '');
      return status.includes('Playing');
    },
    { timeout: 90_000, timeoutMsg: 'Playback did not reach Playing' },
  );

  return name;
}

function writeSummary(result: { ok: boolean; notes: string; vibeName: string }): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'manual-checklist.txt'), `${MANUAL_CHECKLIST}\n`);
  fs.writeFileSync(
    path.join(OUT, 'summary.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), result, timeline },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(OUT, 'summary.txt'),
    [
      result.ok ? 'PASS (automated legs)' : 'FAIL',
      result.notes,
      `vibe=${result.vibeName}`,
      '',
      'Manual notification/lock-screen steps: output/media-notification-qa/manual-checklist.txt',
      '',
      'Timeline:',
      ...timeline,
    ].join('\n'),
  );
}

describe('Native Android — media notification QA', () => {
  it('play → background → foreground → MiniPlayer pause/resume/stop', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'manual-checklist.txt'), `${MANUAL_CHECKLIST}\n`);

    await switchToWebView();
    await signInWithEmailPassword();

    clearLogcatBuffer();
    const vibeName = await openFirstVibeAndPlay();
    log(`Playing: ${vibeName}`);

    await clickPlayerBack();
    const mini = await waitForMiniPlayer(12_000);
    await browser.waitUntil(
      async () => mini.$('button[aria-label="Pause"]').isExisting(),
      { timeout: 12_000, timeoutMsg: 'MiniPlayer must show Pause before background' },
    );
    await snapshotStep('00-playing-before-background');

    log('Backgrounding app (expect media + FGS notifications on device)');
    sendAppToBackground();
    await browser.pause(2_500);
    capturePlaybackLogcat(OUT, 'while-backgrounded');

    log('Returning to foreground');
    bringAppToForeground();
    await switchToWebView();
    await browser.pause(1_500);

    const fgSnap = await snapshotStep('01-after-foreground');
    const fgFindings = analyzeBridgeDesync('after-foreground', fgSnap).filter((f) => f.severity === 'error');
    if (fgSnap.store.playbackState !== 'playing') {
      writeSummary({ ok: false, notes: `expected playing after foreground, got ${fgSnap.store.playbackState}`, vibeName });
      throw new Error('Playback not playing after foreground');
    }
    if (fgFindings.length > 0) {
      writeSummary({ ok: false, notes: fgFindings.map((f) => f.code).join(', '), vibeName });
      throw new Error(fgFindings[0]!.message);
    }

    clearLogcatBuffer();
    await mini.$('button[aria-label="Pause"]').click();
    await browser.waitUntil(
      async () => mini.$('button[aria-label="Resume"]').isExisting(),
      { timeout: 8_000, timeoutMsg: 'MiniPlayer Resume after pause' },
    );
    await snapshotStep('02-after-mini-pause');
    capturePlaybackLogcat(OUT, 'after-mini-pause');

    await mini.$('button[aria-label="Resume"]').click();
    await browser.waitUntil(
      async () => mini.$('button[aria-label="Pause"]').isExisting(),
      { timeout: 8_000, timeoutMsg: 'MiniPlayer Pause after resume' },
    );
    await snapshotStep('03-after-mini-resume');

    await mini.$('button[aria-label="Stop"]').click();
    await browser.waitUntil(
      async () => !(await mini.isExisting()),
      { timeout: 10_000, timeoutMsg: 'MiniPlayer should hide after stop' },
    );
    const stopSnap = await snapshotStep('04-after-stop');
    capturePlaybackLogcat(OUT, 'after-stop');

    if (stopSnap.store.playbackState !== 'idle' || stopSnap.store.showMiniPlayer) {
      writeSummary({ ok: false, notes: 'MiniPlayer or store not idle after stop', vibeName });
      throw new Error('Stop did not clear session');
    }

    const logcat = analyzePlaybackLogcat(
      fs.readFileSync(path.join(OUT, 'after-stop.logcat.txt'), 'utf8'),
    );
    if (logcat.nativeResumeFailed) {
      writeSummary({ ok: false, notes: 'native resume failure in logcat after stop leg', vibeName });
      throw new Error('Unexpected native resume failure in logcat');
    }

    writeSummary({
      ok: true,
      notes: 'background+foreground playing stable; MiniPlayer pause/resume/stop; complete manual checklist on device',
      vibeName,
    });
  });
});
