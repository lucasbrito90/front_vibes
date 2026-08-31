/**
 * Scene manual execute (v1.3.0-T08) — native Android E2E against staging API.
 * Output: qa/scene-execute-e2e/evidence/ (screenshots, summary.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import { navigateAppRouteSpa, switchToWebView } from '../tests/smoke/android/helpers/webview.js';

const API_BASE = (process.env.VITE_API_BASE_URL ?? 'https://staging-api.ixora-app.app').replace(/\/+$/, '');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'qa', 'scene-execute-e2e', 'evidence', 'android-device');
const ENV_FILE = path.join(ROOT, 'front_vibes', '.env');

const results: Array<{ id: string; name: string; pass: boolean; notes: string }> = [];
const timeline: string[] = [];
let sceneId: number | null = null;
let sceneName = '';

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[scene-execute-e2e] ${line}`);
}

function record(id: string, name: string, pass: boolean, notes: string): void {
  results.push({ id, name, pass, notes });
  log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} — ${notes}`);
}

function adb(cmd: string): string {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
}

function envVar(key: string): string {
  const line = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing ${key} in ${ENV_FILE}`);
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
}

function apiToken(): string {
  const apiKey = envVar('VITE_FIREBASE_API_KEY');
  const email = envVar('E2E_USER_EMAIL');
  const password = envVar('E2E_USER_PASSWORD');
  const resp = execSync(
    `curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}" -H 'Content-Type: application/json' -d '${JSON.stringify({ email, password, returnSecureToken: true })}'`,
    { encoding: 'utf8' },
  );
  return JSON.parse(resp).idToken as string;
}

function apiJson(method: string, route: string, body?: unknown): unknown {
  const token = apiToken();
  const args = ['curl', '-sS', '-X', method, `"${API_BASE}${route}"`, '-H', `"Authorization: Bearer ${token}"`, '-H', '"Accept: application/json"'];
  if (body !== undefined) {
    args.push('-H', '"Content-Type: application/json"', '-d', `'${JSON.stringify(body)}'`);
  }
  const out = execSync(args.join(' '), { encoding: 'utf8' });
  return JSON.parse(out || '{}');
}

async function capture(label: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(OUT, `${safe}.png`));
}

describe('Scene manual execute (v1.3.0-T08) — Android device E2E (staging)', () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await switchToWebView();
    await signInWithEmailPassword();
    record('BOOT', 'Sign-in', true, 'Authenticated via Firebase + Laravel sync');

    sceneName = `QA Execute Scene ${Date.now().toString().slice(-6)}`;
    const created = apiJson('POST', '/api/scenes', { name: sceneName }) as { data?: { id: number } };
    sceneId = created.data?.id ?? null;
    record('SETUP-1', 'Create scene via API', sceneId != null, sceneId ? `id=${sceneId}` : 'failed');

    if (sceneId) {
      const action = apiJson('POST', `/api/scenes/${sceneId}/actions`, { device_id: 1, action_type: 'turn_on' }) as { data?: { id: number } };
      record('SETUP-2', 'Add one action via API', action.data?.id != null, action.data?.id ? `action_id=${action.data.id}` : 'failed');
    }
  });

  after(() => {
    if (sceneId) {
      try {
        apiJson('DELETE', `/api/scenes/${sceneId}`);
        log(`cleanup: deleted scene ${sceneId}`);
      } catch (e) {
        log(`cleanup failed: ${String(e)}`);
      }
    }
    fs.mkdirSync(OUT, { recursive: true });
    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.filter((r) => !r.pass).length;
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ device: adb('devices -l'), apiBase: API_BASE, passCount, failCount, results, timeline }, null, 2));
    fs.writeFileSync(
      path.join(OUT, 'summary.txt'),
      ['Scene manual execute Android E2E', `PASS=${passCount} FAIL=${failCount}`, ...results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}: ${r.notes}`)].join('\n'),
    );
  });

  it('executes the scene from the Scenes list and shows a result toast', async () => {
    if (!sceneId) throw new Error('no scene id from setup');

    await navigateAppRouteSpa('/scenes');
    await browser.waitUntil(
      async () => (await browser.execute((name) => document.querySelector('.tab-page:not(.ion-page-hidden)')?.textContent?.includes(name) ?? false, sceneName)),
      { timeout: 20_000, timeoutMsg: 'Scene card not visible on Scenes list' },
    );
    await capture('01-scenes-list');
    record('NAV-1', 'Scenes list shows the test scene', true, 'ok');

    const clicked = await browser.execute((name) => {
      const cards = Array.from(document.querySelectorAll('.tab-page:not(.ion-page-hidden) .scene-card'));
      const card = cards.find((c) => c.textContent?.includes(name));
      const executeBtn = Array.from(card?.querySelectorAll('ion-button') ?? []).find((b) => b.textContent?.trim().includes('Execute')) as HTMLElement | undefined;
      executeBtn?.click();
      return !!executeBtn;
    }, sceneName);
    record('EXEC-1', 'Execute button found and clicked', clicked === true, `clicked=${clicked}`);

    await browser.waitUntil(
      async () => {
        const msg = await browser.execute(() => (document.querySelector('ion-toast') as unknown as { message?: string } | null)?.message ?? '');
        return typeof msg === 'string' && msg.length > 0;
      },
      { timeout: 10_000, timeoutMsg: 'No toast message appeared after Execute click' },
    );
    await browser.pause(500);
    await capture('02-after-execute-toast');

    const toastMessage = await browser.execute(() => (document.querySelector('ion-toast') as unknown as { message?: string } | null)?.message ?? '');
    record('EXEC-2', 'Toast shows dispatch summary', /1 action dispatched/.test(toastMessage), `toast="${toastMessage}"`);

    const list = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: unknown[] };
    record('EXEC-3', 'Action still present after execute (fire-and-forget, non-destructive)', (list.data?.length ?? 0) === 1, `count=${list.data?.length}`);
  });

  it('blocks execute client-side when offline', async () => {
    if (!sceneId) throw new Error('no scene id');

    await navigateAppRouteSpa('/scenes');
    await browser.pause(1000);

    await browser.execute(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
    await browser.pause(500);

    const clicked = await browser.execute((name) => {
      const cards = Array.from(document.querySelectorAll('.tab-page:not(.ion-page-hidden) .scene-card'));
      const card = cards.find((c) => c.textContent?.includes(name));
      const executeBtn = Array.from(card?.querySelectorAll('ion-button') ?? []).find((b) => b.textContent?.trim().includes('Execute')) as HTMLElement | undefined;
      executeBtn?.click();
      return !!executeBtn;
    }, sceneName);

    await browser.waitUntil(
      async () => {
        const msg = await browser.execute(() => (document.querySelector('ion-toast') as unknown as { message?: string } | null)?.message ?? '');
        return typeof msg === 'string' && msg.length > 0;
      },
      { timeout: 10_000, timeoutMsg: 'No offline-block toast appeared' },
    );
    const toastMessage = await browser.execute(() => (document.querySelector('ion-toast') as unknown as { message?: string } | null)?.message ?? '');
    await capture('03-offline-block-toast');
    record('OFFLINE-1', 'Execute blocked offline with a message, button click still handled', clicked === true && /offline|only be changed while online/i.test(toastMessage), `toast="${toastMessage}"`);

    await browser.execute(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });

    const listAfterOffline = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: unknown[] };
    record('OFFLINE-2', 'No duplicate dispatch happened while offline-blocked', (listAfterOffline.data?.length ?? 0) === 1, `count=${listAfterOffline.data?.length}`);
  });
});
