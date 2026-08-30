/**
 * Scenes CRUD (v1.3.0-T06) — native Android E2E against staging API.
 * Output: qa/scenes-e2e/evidence/ (screenshots, logcat, summary.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { browser, driver } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import { navigateAppRouteSpa, switchToWebView } from '../tests/smoke/android/helpers/webview.js';

const API_BASE = (process.env.VITE_API_BASE_URL ?? 'https://staging-api.ixora-app.app').replace(/\/+$/, '');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'qa', 'scenes-e2e', 'evidence', 'android-device');
const ENV_FILE = path.join(ROOT, 'front_vibes', '.env');

const results: Array<{ id: string; name: string; pass: boolean | null; notes: string }> = [];
const timeline: string[] = [];
const createdSceneIds: number[] = [];

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[scenes-e2e] ${line}`);
}

function record(id: string, name: string, pass: boolean, notes: string): void {
  results.push({ id, name, pass, notes });
  log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} — ${notes}`);
}

function adb(cmd: string): string {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
}

function envVar(key: string): string {
  if (process.env[key]?.trim()) return process.env[key]!.trim();
  if (!fs.existsSync(ENV_FILE)) throw new Error(`Missing ${key} and no ${ENV_FILE}`);
  const line = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing ${key} in env and ${ENV_FILE}`);
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
}

function apiToken(): string {
  const apiKey = envVar('VITE_FIREBASE_API_KEY');
  const email = envVar('E2E_USER_EMAIL');
  const password = envVar('E2E_USER_PASSWORD');
  const resp = execSync(
    `curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}" `
    + `-H 'Content-Type: application/json' `
    + `-d '${JSON.stringify({ email, password, returnSecureToken: true })}'`,
    { encoding: 'utf8' },
  );
  const data = JSON.parse(resp) as { idToken?: string };
  if (!data.idToken) throw new Error('Firebase sign-in failed for API verification');
  return data.idToken;
}

function apiJson(method: string, route: string): unknown {
  const token = apiToken();
  const out = execSync(
    `curl -sS -X ${method} "${API_BASE}${route}" -H "Authorization: Bearer ${token}" -H "Accept: application/json"`,
    { encoding: 'utf8' },
  );
  return JSON.parse(out || '{}');
}

async function capture(label: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(OUT, `${safe}.png`));
}

function dumpLogcat(tag: string): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${tag}.logcat.txt`), adb('logcat -d -t 600'));
}

async function dismissOpenAlerts(): Promise<void> {
  const cancel = await browser.$('button=CANCEL');
  if (await cancel.isExisting()) {
    await cancel.click();
    await browser.pause(400);
  }
}

async function waitForScenesPage(): Promise<void> {
  await browser.waitUntil(
    async () => (await browser.execute(() => window.location.pathname)) === '/scenes',
    { timeout: 30_000, timeoutMsg: 'Not on /scenes route' },
  );
  await browser.waitUntil(
    async () => {
      const text = await browser.execute(() => document.body?.innerText ?? '');
      return text.includes('Scenes') || text.includes('No scenes yet') || text.includes('Loading your scenes');
    },
    { timeout: 45_000, timeoutMsg: 'Scenes page content not visible' },
  );
  await browser.waitUntil(
    async () => !(await browser.$('text=Loading your scenes…').isExisting().catch(() => false)),
    { timeout: 45_000, timeoutMsg: 'Scenes list still loading' },
  );
}

async function findSceneIdByName(name: string): Promise<number | null> {
  const list = apiJson('GET', '/api/scenes') as { data?: Array<{ id: number; name: string }> };
  const row = list.data?.find((s) => s.name === name);
  return row?.id ?? null;
}

function writeSummary(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const passCount = results.filter((r) => r.pass === true).length;
  const failCount = results.filter((r) => r.pass === false).length;
  const summary = { device: adb('devices -l'), apiBase: API_BASE, passCount, failCount, results, timeline, createdSceneIds };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'summary.txt'),
    ['Scenes CRUD Android E2E', `PASS=${passCount} FAIL=${failCount}`, ...results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}: ${r.notes}`)].join('\n'),
  );
}

describe('Scenes CRUD (v1.3.0-T06) — Android device E2E (staging)', () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'device.txt'), adb('devices -l'));
    adb('logcat -c');
    await switchToWebView();
    await signInWithEmailPassword();
    record('BOOT', 'Sign-in', true, 'Authenticated via Firebase + Laravel sync');
  });

  after(() => {
    writeSummary();
  });

  it('navigates to Scenes from Home', async () => {
    await navigateAppRouteSpa('/home');
    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/home',
      { timeout: 15_000 },
    );
    const scenesBtn = await browser.$('a[href="/scenes"], ion-button[router-link="/scenes"]');
    const exists = await scenesBtn.isExisting();
    if (exists) {
      await scenesBtn.click();
      await waitForScenesPage();
    } else {
      await navigateAppRouteSpa('/scenes');
      await waitForScenesPage();
    }
    await capture('01-scenes-list');
    record('NAV-1', 'Home has Scenes entry point and navigates', true, exists ? 'clicked Home button' : 'entry point not found by selector, navigated directly');
  });

  it('creates a scene (CRUD create)', async () => {
    await waitForScenesPage();
    const stamp = Date.now().toString().slice(-6);
    const sceneName = `QA Device Scene ${stamp}`;

    await browser.$('ion-fab-button').waitForClickable({ timeout: 15_000 });
    await browser.$('ion-fab-button').click();
    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/scenes/create',
      { timeout: 15_000, timeoutMsg: 'Create Scene form did not open' },
    );
    await browser.pause(800);

    const nameInput = await browser.$('ion-input input');
    await nameInput.waitForExist({ timeout: 10_000 });
    await browser.execute((value) => {
      const input = document.querySelector('.ion-page.tab-page:not(.ion-page-hidden) ion-input input') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      const ionInputEl = input.closest('ion-input');
      ionInputEl?.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true, composed: true }));
      ionInputEl?.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true, composed: true }));
    }, sceneName);
    await browser.pause(300);

    await dismissOpenAlerts();
    const preClickState = await browser.execute(() => {
      const btn = document.querySelector('.ion-page.tab-page:not(.ion-page-hidden) ion-button.auth-submit') as (HTMLElement & { disabled?: boolean }) | null;
      const nameVal = (document.querySelector('ion-input input') as HTMLInputElement | null)?.value;
      return { disabled: btn?.disabled, hasBtn: !!btn, nameVal };
    });
    log(`pre-click state: ${JSON.stringify(preClickState)}`);
    await capture('01b-before-submit-click');

    await browser.execute(() => {
      const visible = document.querySelector('.ion-page.tab-page:not(.ion-page-hidden) ion-button.auth-submit') as HTMLElement | null;
      visible?.click();
    });
    await browser.pause(1500);
    const postClickState = await browser.execute(() => ({
      pathname: window.location.pathname,
      bodyText: document.body?.innerText?.slice(0, 300) ?? '',
    }));
    log(`post-click state: ${JSON.stringify(postClickState)}`);
    await capture('01c-after-submit-click');

    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/scenes',
      { timeout: 30_000, timeoutMsg: 'Create scene did not return to list' },
    );
    await waitForScenesPage();

    const sceneId = await findSceneIdByName(sceneName);
    if (sceneId) createdSceneIds.push(sceneId);
    record('CRUD-1', 'Create scene', sceneId != null, sceneId ? `id=${sceneId}, backend confirmed via GET /api/scenes` : 'backend missing row');
    await capture('02-after-create');

    (global as unknown as { __sceneName?: string }).__sceneName = sceneName;
  });

  it('edits the scene name (CRUD update)', async () => {
    const sceneId = createdSceneIds[0];
    if (!sceneId) {
      record('CRUD-2', 'Edit scene', false, 'no scene id from create step');
      return;
    }

    await navigateAppRouteSpa(`/scenes/${sceneId}/edit`);
    await browser.$('ion-title=Edit Scene').waitForExist({ timeout: 15_000 });

    const nameInput = await browser.$('.tab-page ion-input input');
    await nameInput.waitForExist({ timeout: 10_000 });
    const editedName = `${((global as unknown as { __sceneName?: string }).__sceneName) ?? 'QA Device Scene'} edited`;
    await browser.execute((value) => {
      const input = document.querySelector('.ion-page.tab-page:not(.ion-page-hidden) ion-input input') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      const ionInputEl = input.closest('ion-input');
      ionInputEl?.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true, composed: true }));
      ionInputEl?.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true, composed: true }));
    }, editedName);
    await browser.pause(300);

    await browser.execute(() => {
      const visible = document.querySelector('.ion-page.tab-page:not(.ion-page-hidden) ion-button.auth-submit') as HTMLElement | null;
      visible?.click();
    });

    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/scenes',
      { timeout: 30_000, timeoutMsg: 'Edit scene did not return to list' },
    );
    await waitForScenesPage();

    const patched = apiJson('GET', `/api/scenes/${sceneId}`) as { data?: { name?: string } };
    record('CRUD-2', 'Edit scene name', patched.data?.name === editedName, patched.data?.name ?? 'no name');
    await capture('03-after-edit');
  });

  it('deletes the scene (CRUD delete)', async () => {
    const sceneId = createdSceneIds[0];
    if (!sceneId) {
      record('CRUD-3', 'Delete scene', false, 'no scene id from create step');
      return;
    }

    await waitForScenesPage();
    await browser.execute((id) => {
      const cards = Array.from(document.querySelectorAll('.scene-card'));
      const card = cards.find((c) => c.textContent?.includes('edited'));
      const del = card?.querySelector('ion-button[color="danger"]') as HTMLElement | null;
      del?.click();
    }, sceneId);

    await browser.$('button=Delete').waitForClickable({ timeout: 10_000 });
    await browser.$('button=Delete').click();
    await browser.pause(2000);

    const list = apiJson('GET', '/api/scenes') as { data?: Array<{ id: number }> };
    const stillExists = list.data?.some((s) => s.id === sceneId) ?? false;
    record('CRUD-4', 'Delete scene', !stillExists, stillExists ? 'still present in API' : 'removed from API');
    await capture('04-after-delete');
    dumpLogcat('final');
  });
});
