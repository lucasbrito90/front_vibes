/**
 * Native Android — player lifecycle QA with real Firebase auth.
 *
 * Credentials (never hardcoded):
 *   E2E_USER_EMAIL, E2E_USER_PASSWORD
 *
 * Requires debug APK built WITHOUT VITE_E2E_MOCK_AUTH.
 */
import fs from 'node:fs';
import path from 'node:path';

import { browser, driver } from '@wdio/globals';

import { signInWithEmailPassword } from './helpers/auth.js';
import { capture, ensureOutputDir } from './helpers/screenshots.js';
import { navigateAppRoute, switchToWebView } from './helpers/webview.js';

const timeline: string[] = [];

function log(step: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${step}`;
  timeline.push(line);
  console.log(`[native-lifecycle] ${line}`);
}

async function dumpLogcat(tag = 'native-lifecycle-failure'): Promise<void> {
  const out = path.join(ensureOutputDir(), `${tag}.logcat.txt`);
  try {
    const { execSync } = await import('node:child_process');
    const data = execSync('adb logcat -d -t 400', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    fs.writeFileSync(out, data);
    console.log(`[native-lifecycle] logcat saved: ${out}`);
  } catch (err) {
    console.warn('[native-lifecycle] logcat capture failed', err);
  }
}

async function readUiState(): Promise<Record<string, string>> {
  return browser.execute(() => {
    const harnessToggle = document.querySelector('[data-testid="player-debug-harness-toggle"]');
    const readVal = (key: string): string => {
      const keys = document.querySelectorAll('.player-debug-key');
      for (const el of keys) {
        if (el.textContent?.trim() === key) {
          const val = el.nextElementSibling?.textContent?.trim();
          return val ?? '';
        }
      }
      return '';
    };

    return {
      path: window.location.pathname,
      harnessVisible: harnessToggle ? 'yes' : 'no',
      currentVibeId: readVal('currentVibeId'),
      currentVibeName: readVal('currentVibeName'),
      playbackState: readVal('playbackState'),
      showMiniPlayer: readVal('showMiniPlayer'),
      hasActiveLayersStore: readVal('hasActiveLayers (store)'),
      hasActiveLayersService: readVal('hasActiveLayers (service)'),
      miniPlayerName: document.querySelector('.mini-player-name')?.textContent?.trim() ?? '',
      miniPlayerMeta: document.querySelector('.mini-player-meta')?.textContent?.trim() ?? '',
      playerStatus: document.querySelector('.player-status-text')?.textContent?.trim() ?? '',
    };
  });
}

async function expandHarnessIfPresent(): Promise<void> {
  const toggle = await browser.$('[data-testid="player-debug-harness-toggle"]');
  if (!(await toggle.isExisting())) return;
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') await toggle.click();
}

async function openVibeCard(index: number): Promise<string> {
  await navigateAppRoute('/vibes');
  await browser.$('ion-title').waitForExist({ timeout: 20_000 });

  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
      const cards = await browser.$$('.vibe-card');
      const empty = await browser.$('text=No vibes yet').isExisting().catch(() => false);
      return !loading && (cards.length > 0 || empty);
    },
    { timeout: 45_000, timeoutMsg: 'Vibes list did not finish loading' },
  );

  const cards = await browser.$$('.vibe-card');
  if (cards.length <= index) {
    throw new Error(`Need at least ${index + 1} vibes on account; found ${cards.length}`);
  }
  const card = cards[index];
  const name = await card.$('.vibe-card-name').getText();
  await card.click();
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });
  await browser.$('[data-testid="player-play-button"]').waitForExist({ timeout: 20_000 });
  return name;
}

describe('Native Android — player lifecycle (real auth)', () => {
  afterEach(async function failHook() {
    if (this.currentTest?.state === 'failed') {
      await capture('failure-state');
      await dumpLogcat();
    }
  });

  it('login, play, mini player, background, pause/resume, stop, switch vibe', async () => {
    fs.writeFileSync(
      path.join(ensureOutputDir(), 'device.txt'),
      `model=${process.env.ANDROID_DEVICE_MODEL ?? 'motorola_edge_2023 (adb)'}\n`,
    );

    await switchToWebView();
    log('WebView ready');
    await capture('01-webview');

    await signInWithEmailPassword();
    log('Authenticated');
    await capture('02-authenticated');

    const firstVibeName = await openVibeCard(0);
    log(`Opened vibe: ${firstVibeName}`);
    await capture('03-player-loaded');

    const playBtn = await browser.$('[data-testid="player-play-button"]');
    await playBtn.waitForClickable({ timeout: 15_000 });
    await playBtn.click();
    log('Tapped play');

    await browser.waitUntil(
      async () => {
        const status = await browser.$('.player-status-text').getText().catch(() => '');
        return /Playing|Preparing|Paused/.test(status);
      },
      { timeout: 45_000, timeoutMsg: 'Playback did not leave Ready state' },
    );
    await capture('04-after-play');

    let ui = await readUiState();
    log(`UI after play: ${JSON.stringify(ui)}`);

    await browser.$('button.player-icon-btn[aria-label="Back"]').click();
    await browser.waitUntil(
      async () => !(await browser.$('[data-testid="player-page"]').isExisting()),
      { timeout: 10_000 },
    );
    log('Left player page');
    await capture('05-mini-player-on-vibes');

    const mini = await browser.$('.mini-player');
    await mini.waitForExist({ timeout: 10_000 });
    ui = await readUiState();
    if (ui.miniPlayerName && firstVibeName && !ui.miniPlayerName.includes(firstVibeName.split(' ')[0] ?? '')) {
      throw new Error(`MiniPlayer title mismatch: ${ui.miniPlayerName}`);
    }

    await driver.background(5);
    log('App backgrounded 5s');
    await driver.activateApp(process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter');
    log('App foregrounded');
    await capture('06-after-background');

    ui = await readUiState();
    if (!(await mini.isExisting())) {
      throw new Error('MiniPlayer missing after background/foreground');
    }

    const pauseBtn = await mini.$('button[aria-label="Pause"]');
    if (await pauseBtn.isExisting()) {
      await pauseBtn.click();
      log('Paused from MiniPlayer');
      await browser.waitUntil(
        async () => (await mini.$('button[aria-label="Resume"]').isExisting()),
        { timeout: 5_000 },
      );
      await capture('07-paused');
      await mini.$('button[aria-label="Resume"]').click();
      log('Resumed from MiniPlayer');
      await capture('08-resumed');
    }

    await mini.click();
    await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 10_000 });
    log('Returned to player via MiniPlayer');
    await expandHarnessIfPresent();
    ui = await readUiState();
    log(`UI on return: ${JSON.stringify(ui)}`);
    await capture('09-return-to-player');

    await browser.$('button.player-icon-btn[aria-label="Back"]').click();
    await mini.waitForExist({ timeout: 8_000 });
    await mini.$('button[aria-label="Stop"]').click();
    log('Stopped from MiniPlayer');
    await browser.waitUntil(
      async () => !(await browser.$('.mini-player').isExisting()),
      { timeout: 8_000, timeoutMsg: 'MiniPlayer still visible after stop' },
    );
    await capture('10-after-stop');

    const secondName = await openVibeCard(1);
    const playBtn2 = await browser.$('[data-testid="player-play-button"]');
    await playBtn2.waitForClickable({ timeout: 15_000 });
    await playBtn2.click();
    log(`Tapped play on second vibe: ${secondName}`);

    await browser.waitUntil(
      async () => {
        const status = await browser.$('.player-status-text').getText().catch(() => '');
        return /Playing|Preparing|Paused/.test(status);
      },
      { timeout: 90_000, timeoutMsg: `Second vibe did not start playback (${secondName})` },
    );
    log(`Started second session: ${secondName}`);
    await capture('11-second-vibe-playing');

    await browser.$('button.player-icon-btn[aria-label="Back"]').click();
    await mini.waitForExist({ timeout: 8_000 });
    const miniName = await mini.$('.mini-player-name').getText();
    if (!miniName.includes(secondName.split(' ')[0] ?? secondName)) {
      throw new Error(`Second vibe MiniPlayer stale title: ${miniName} (expected ${secondName})`);
    }
    await capture('12-second-vibe-mini');

    await mini.$('button[aria-label="Stop"]').click();
    await browser.waitUntil(
      async () => !(await browser.$('.mini-player').isExisting()),
      { timeout: 8_000 },
    );

    ui = await readUiState();
    log(`Final UI: ${JSON.stringify(ui)}`);
    fs.writeFileSync(path.join(ensureOutputDir(), 'timeline.txt'), timeline.join('\n'));
    fs.writeFileSync(path.join(ensureOutputDir(), 'final-ui-state.json'), JSON.stringify(ui, null, 2));
  });
});
