/**
 * Native Android — pause/resume instrumentation QA.
 *
 * Exercises play → pause → resume from an audibly playing state (MiniPlayer Pause
 * visible first). Captures WebView bridge snapshots + filtered logcat per step.
 *
 * Requires APK built with VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true for engine flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import {
  clickPlayerBack,
  collectPlayerNavDiagnostics,
  navigateAppRouteSpa,
  switchToWebView,
  waitForLeftPlayerPage,
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
  type PlaybackDesyncFinding,
} from './helpers/playback-bridge.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'pause-resume-qa');
const timeline: string[] = [];
const bridgeSnapshots: Record<string, PlaybackBridgeSnapshot> = {};
const desyncFindings: PlaybackDesyncFinding[] = [];

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[pause-resume-qa] ${line}`);
}

async function captureScreenshot(label: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(OUT, `${safe}.png`));
}

async function snapshotStep(step: string): Promise<void> {
  const snap = await readPlaybackBridgeSnapshot();
  bridgeSnapshots[step] = snap;
  desyncFindings.push(...analyzeBridgeDesync(step, snap));
  log(`bridge ${step}: store=${snap.store.playbackState} enginePaused=${snap.engine?.sessionPaused ?? 'n/a'} aria=${snap.ui.playPauseAriaLabel || '—'}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `bridge-${step}.json`), JSON.stringify(snap, null, 2));
}

async function logcatStep(step: string): Promise<void> {
  const { filteredPath, analysis } = capturePlaybackLogcat(OUT, step);
  log(`logcat ${step}: filtered=${filteredPath} resumeSkipped=${analysis.resumeAllSkipped} nativeResumeFailed=${analysis.nativeResumeFailed}`);
  fs.writeFileSync(path.join(OUT, `logcat-analysis-${step}.json`), JSON.stringify(analysis, null, 2));
}

async function openFirstVibePlayer(): Promise<string> {
  await navigateAppRouteSpa('/vibes');
  await browser.$('ion-title').waitForExist({ timeout: 20_000 });

  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
      const cards = await browser.$$('.vibe-card');
      return !loading && cards.length > 0;
    },
    { timeout: 90_000, timeoutMsg: 'No vibe cards — seed native offline QA fixtures or add vibes' },
  );

  const cards = await browser.$$('.vibe-card');
  const name = await cards[0].$('.vibe-card-name').getText();
  await cards[0].click();
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });
  return name;
}

async function startPlaybackFromPlayerPage(): Promise<void> {
  const playBtn = await browser.$('[data-testid="player-play-button"]');
  await playBtn.waitForClickable({ timeout: 15_000 });
  await playBtn.click();

  await browser.waitUntil(
    async () => {
      const status = await browser.$('.player-status-text').getText().catch(() => '');
      return /Playing|Preparing/.test(status);
    },
    { timeout: 90_000, timeoutMsg: 'Playback did not start from player page' },
  );

  await browser.waitUntil(
    async () => {
      const status = await browser.$('.player-status-text').getText().catch(() => '');
      return status.includes('Playing');
    },
    { timeout: 60_000, timeoutMsg: 'Playback never reached Playing on player page' },
  );
}

/**
 * Forces pause → resume starting from playing (Pause visible).
 * Fails fast if MiniPlayer is already paused when we expect playing.
 */
async function exercisePauseResumeFromPlaying(mini: WebdriverIO.Element): Promise<{
  ok: boolean;
  notes: string;
}> {
  const pauseBtn = mini.$('button[aria-label="Pause"]');
  const hasPause = await pauseBtn.isExisting();
  if (!hasPause) {
    const meta = await mini.$('.mini-player-meta').getText().catch(() => '');
    return {
      ok: false,
      notes: `expected Pause (playing) before cycle; meta="${meta}"`,
    };
  }

  clearLogcatBuffer();
  await snapshotStep('01-before-pause');

  await pauseBtn.click();
  await browser.waitUntil(
    async () => mini.$('button[aria-label="Resume"]').isExisting(),
    { timeout: 8_000, timeoutMsg: 'MiniPlayer did not show Resume after pause' },
  );
  await browser.pause(800);
  await snapshotStep('02-after-pause');
  await logcatStep('after-pause');
  await captureScreenshot('02-after-pause');

  await mini.$('button[aria-label="Resume"]').click();
  await browser.waitUntil(
    async () => mini.$('button[aria-label="Pause"]').isExisting(),
    { timeout: 8_000, timeoutMsg: 'MiniPlayer did not show Pause after resume' },
  );
  await browser.pause(1_200);
  await snapshotStep('03-after-resume');
  await logcatStep('after-resume');
  await captureScreenshot('03-after-resume');

  const afterResume = bridgeSnapshots['03-after-resume'];
  const logcatAnalysis = analyzePlaybackLogcat(
    fs.readFileSync(path.join(OUT, 'after-resume.logcat.txt'), 'utf8'),
  );

  const uiPlaying = afterResume?.store.playbackState === 'playing';
  const engineResumed = afterResume?.engine?.sessionPaused === false;
  const resumeSkipped = logcatAnalysis.resumeAllSkipped;
  const nativeResumeFailed = logcatAnalysis.nativeResumeFailed;
  const bridgeErrors = desyncFindings.filter((f) => f.severity === 'error');

  if (!uiPlaying) {
    return { ok: false, notes: `after resume store.playbackState=${afterResume?.store.playbackState}` };
  }
  if (!engineResumed) {
    return { ok: false, notes: 'after resume _sessionPaused still true (bridge)' };
  }
  if (resumeSkipped) {
    return { ok: false, notes: 'logcat shows resumeAll skipped during cycle' };
  }
  if (nativeResumeFailed) {
    return { ok: false, notes: 'logcat shows NativeAudio.resume failure' };
  }
  if (bridgeErrors.length > 0) {
    return { ok: false, notes: bridgeErrors.map((f) => f.code).join(', ') };
  }

  return { ok: true, notes: 'pause→resume from playing; bridge + logcat clean' };
}

function writeSummary(result: { ok: boolean; notes: string; vibeName: string }): void {
  fs.mkdirSync(OUT, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    result,
    desyncFindings,
    bridgeSnapshots,
    timeline,
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'summary.txt'),
    [
      result.ok ? 'PASS' : 'FAIL',
      result.notes,
      `vibe=${result.vibeName}`,
      '',
      'Bridge desync findings:',
      ...desyncFindings.map((f) => `[${f.severity}] ${f.code}: ${f.message}`),
      '',
      'Timeline:',
      ...timeline,
    ].join('\n'),
  );
}

describe('Native Android — pause/resume instrumentation', () => {
  afterEach(async function failureArtifacts() {
    if (this.currentTest?.state !== 'failed') return;
    fs.mkdirSync(OUT, { recursive: true });
    await captureScreenshot('failure');
    try {
      capturePlaybackLogcat(OUT, 'failure');
    } catch {
      /* adb may be unavailable in CI without device */
    }
    writeSummary({ ok: false, notes: 'spec failed — see failure artifacts', vibeName: '' });
  });

  it('captures bridge + logcat for play → pause → resume from playing', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, 'device.txt'),
      `model=${process.env.ANDROID_DEVICE_MODEL ?? 'adb'}\npackage=${process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter'}\n`,
    );

    await switchToWebView();
    log('WebView ready');

    await signInWithEmailPassword();
    log('Authenticated');

    const vibeName = await openFirstVibePlayer();
    log(`Opened vibe: ${vibeName}`);

    clearLogcatBuffer();
    await startPlaybackFromPlayerPage();
    log('Playing on player page');
    await snapshotStep('00-playing-on-player-page');
    await captureScreenshot('00-playing-on-player-page');

    await clickPlayerBack();
    await waitForLeftPlayerPage();
    await collectPlayerNavDiagnostics('after-back-from-playing');

    const mini = await waitForMiniPlayer(12_000);
    await browser.waitUntil(
      async () => mini.$('button[aria-label="Pause"]').isExisting(),
      {
        timeout: 12_000,
        timeoutMsg: 'MiniPlayer must show Pause (playing) before pause/resume cycle',
      },
    );
    log('MiniPlayer playing — starting pause→resume cycle');
    await snapshotStep('00-mini-playing-before-cycle');
    await captureScreenshot('00-mini-playing-before-cycle');

    const cycle = await exercisePauseResumeFromPlaying(mini);
    log(`${cycle.ok ? 'PASS' : 'FAIL'} — ${cycle.notes}`);

    writeSummary({ ok: cycle.ok, notes: cycle.notes, vibeName });

    if (!cycle.ok) {
      throw new Error(cycle.notes);
    }
  });
});
