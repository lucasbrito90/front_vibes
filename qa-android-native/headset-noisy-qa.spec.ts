/**
 * Native Android — headset / Bluetooth disconnect QA (simulated ACTION_AUDIO_BECOMING_NOISY).
 *
 * Validates that unplug/noisy events pause playback in foreground and while background
 * audio is active, MiniPlayer shows Resume, and pausedByAudioFocus stays cleared.
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
  capturePlaybackLogcat,
  clearLogcatBuffer,
} from './helpers/logcat.js';
import {
  analyzeBridgeDesync,
  readPlaybackBridgeSnapshot,
  type PlaybackBridgeSnapshot,
} from './helpers/playback-bridge.js';
import {
  bringAppToForeground,
  dispatchAudioBecomingNoisyInWebView,
  logcatShowsNoisyReceiverRegistered,
  sendAppToBackground,
} from './helpers/noisy-audio.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'headset-noisy-qa');
const timeline: string[] = [];

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[headset-noisy-qa] ${line}`);
}

async function snapshotStep(step: string): Promise<PlaybackBridgeSnapshot> {
  const snap = await readPlaybackBridgeSnapshot();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `bridge-${step}.json`), JSON.stringify(snap, null, 2));
  log(
    `bridge ${step}: store=${snap.store.playbackState} enginePaused=${snap.engine?.sessionPaused ?? 'n/a'} aria=${snap.ui.playPauseAriaLabel || '—'} focusFlag=${String(snap.engine?.pausedByAudioFocus ?? 'n/a')}`,
  );
  return snap;
}

function assertPausedState(snap: PlaybackBridgeSnapshot, label: string): string | null {
  const findings = analyzeBridgeDesync(label, snap);
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length > 0) {
    return errors.map((f) => f.code).join(', ');
  }
  if (snap.store.playbackState !== 'paused') {
    return `${label}: expected store paused, got ${snap.store.playbackState}`;
  }
  if (snap.engine?.sessionPaused !== true) {
    return `${label}: expected engine sessionPaused=true`;
  }
  if (snap.ui.playPauseAriaLabel !== 'Resume') {
    return `${label}: MiniPlayer expected Resume, got "${snap.ui.playPauseAriaLabel}"`;
  }
  if (snap.engine?.pausedByAudioFocus === true) {
    return `${label}: pausedByAudioFocus must be false after noisy pause`;
  }
  return null;
}

async function openFirstVibeAndPlay(): Promise<void> {
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
    { timeout: 90_000, timeoutMsg: 'Playback never reached Playing' },
  );

  await clickPlayerBack();
  const mini = await waitForMiniPlayer(12_000);
  await browser.waitUntil(
    async () => mini.$('button[aria-label="Pause"]').isExisting(),
    { timeout: 12_000, timeoutMsg: 'MiniPlayer must show Pause before noisy test' },
  );
}

describe('Native Android — headset/noisy disconnect QA', () => {
  it('pauses on simulated ACTION_AUDIO_BECOMING_NOISY (foreground + background)', async () => {
    fs.mkdirSync(OUT, { recursive: true });

    await switchToWebView();
    await signInWithEmailPassword();
    clearLogcatBuffer();
    await openFirstVibeAndPlay();
    await snapshotStep('00-playing-before-noisy');

    if (!logcatShowsNoisyReceiverRegistered()) {
      log('WARN: logcat missing MainActivity noisy receiver registration line');
    }

    log('Dispatching audioBecomingNoisy window event (foreground)');
    await dispatchAudioBecomingNoisyInWebView();
    await browser.pause(1_200);

    const fgSnap = await snapshotStep('01-after-noisy-foreground');
    const fgErr = assertPausedState(fgSnap, 'foreground-noisy');
    if (fgErr) throw new Error(fgErr);

    capturePlaybackLogcat(OUT, 'after-noisy-foreground');

    const mini = await waitForMiniPlayer(8_000);
    await mini.$('button[aria-label="Resume"]').click();
    await browser.waitUntil(
      async () => mini.$('button[aria-label="Pause"]').isExisting(),
      { timeout: 8_000, timeoutMsg: 'Resume before background noisy leg failed' },
    );
    await snapshotStep('02-resumed-for-background-leg');

    log('Sending app to background, then dispatching noisy event in WebView');
    sendAppToBackground();
    await browser.pause(800);
    clearLogcatBuffer();
    await dispatchAudioBecomingNoisyInWebView();
    await browser.pause(1_200);
    bringAppToForeground();
    await switchToWebView();
    await browser.pause(1_200);

    const bgSnap = await snapshotStep('03-after-noisy-background');
    const bgErr = assertPausedState(bgSnap, 'background-noisy');
    capturePlaybackLogcat(OUT, 'after-noisy-background');

    fs.writeFileSync(
      path.join(OUT, 'summary.txt'),
      [
        bgErr ? 'FAIL' : 'PASS',
        bgErr ?? 'foreground + background noisy pause stable; MiniPlayer Resume; focus flag clear',
        '',
        'Timeline:',
        ...timeline,
      ].join('\n'),
    );

    if (bgErr) throw new Error(bgErr);
  });
});
