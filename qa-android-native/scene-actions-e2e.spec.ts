/**
 * Scene device actions (v1.3.0-T07) — native Android E2E against staging API.
 * Output: qa/scene-actions-e2e/evidence/ (screenshots, summary.json)
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
const OUT = path.join(ROOT, 'qa', 'scene-actions-e2e', 'evidence', 'android-device');
const ENV_FILE = path.join(ROOT, 'front_vibes', '.env');

const results: Array<{ id: string; name: string; pass: boolean | null; notes: string }> = [];
const timeline: string[] = [];
let sceneId: number | null = null;
let actionIdA: number | null = null;
let actionIdB: number | null = null;

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[scene-actions-e2e] ${line}`);
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

async function pickActionSheetOption(labelSubstring: string): Promise<void> {
  await browser.pause(700);
  const btn = await browser.$(`button*=${labelSubstring}`);
  await btn.waitForExist({ timeout: 8_000 });
  await btn.click();
  await browser.pause(400);
}

async function setDelay(seconds: number): Promise<void> {
  await browser.execute((value) => {
    const input = document.querySelector('.action-modal ion-input input') as HTMLInputElement | null;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    const ionInputEl = input.closest('ion-input');
    ionInputEl?.dispatchEvent(new CustomEvent('ionInput', { detail: { value: String(value) }, bubbles: true, composed: true }));
    ionInputEl?.dispatchEvent(new CustomEvent('ionChange', { detail: { value: String(value) }, bubbles: true, composed: true }));
  }, seconds);
  await browser.pause(300);
}

async function fillAndSaveActionModal(opts: { deviceLabelSubstring: string; actionTypeLabel: string; delaySeconds: number }): Promise<void> {
  await browser.$('.action-modal').waitForExist({ timeout: 10_000 });

  const deviceSelect = await browser.$('.action-modal ion-select');
  await deviceSelect.waitForExist({ timeout: 10_000 });
  await deviceSelect.click();
  await pickActionSheetOption(opts.deviceLabelSubstring);

  const selects = await browser.$$('.action-modal ion-select');
  await selects[1]!.click();
  await pickActionSheetOption(opts.actionTypeLabel);

  await setDelay(opts.delaySeconds);

  const saveBtn = await browser.$('.action-modal ion-buttons[slot="end"] ion-button');
  await saveBtn.waitForClickable({ timeout: 10_000 });
  await saveBtn.click();
  await browser.pause(1500);
}

describe('Scene device actions (v1.3.0-T07) — Android device E2E (staging)', () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await switchToWebView();
    await signInWithEmailPassword();
    record('BOOT', 'Sign-in', true, 'Authenticated via Firebase + Laravel sync');

    const created = apiJson('POST', '/api/scenes', { name: `QA Actions Scene ${Date.now().toString().slice(-6)}` }) as { data?: { id: number } };
    sceneId = created.data?.id ?? null;
    record('SETUP', 'Create scene via API', sceneId != null, sceneId ? `id=${sceneId}` : 'failed');
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
    const passCount = results.filter((r) => r.pass === true).length;
    const failCount = results.filter((r) => r.pass === false).length;
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ device: adb('devices -l'), apiBase: API_BASE, passCount, failCount, results, timeline }, null, 2));
    fs.writeFileSync(
      path.join(OUT, 'summary.txt'),
      ['Scene device actions Android E2E', `PASS=${passCount} FAIL=${failCount}`, ...results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}: ${r.notes}`)].join('\n'),
    );
  });

  it('opens the scene actions page (empty state)', async () => {
    if (!sceneId) throw new Error('no scene id from setup');
    await navigateAppRouteSpa(`/scenes/${sceneId}/actions`);
    await browser.waitUntil(
      async () => (await browser.execute(() => document.querySelector('.tab-page:not(.ion-page-hidden)')?.textContent ?? '')).includes('No device actions yet'),
      { timeout: 15_000, timeoutMsg: 'Empty state not visible on scene actions page' },
    );
    await capture('01-empty-state');
    record('NAV-1', 'Scene actions page opens with empty state', true, 'ok');
  });

  it('adds two actions via the modal', async () => {
    if (!sceneId) throw new Error('no scene id');

    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('.tab-page:not(.ion-page-hidden) ion-button'));
      const btn = buttons.find((b) => b.textContent?.trim() === 'Add action') as HTMLElement | undefined;
      btn?.click();
    });
    await browser.pause(500);
    await fillAndSaveActionModal({ deviceLabelSubstring: 'Living Room', actionTypeLabel: 'Turn on', delaySeconds: 0 });
    await capture('02-after-first-action');

    let list = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number; action_type: string; sort_order: number }> };
    actionIdA = list.data?.[0]?.id ?? null;
    record('CRUD-1', 'Add first action', actionIdA != null, actionIdA ? `id=${actionIdA}, action_type=${list.data?.[0]?.action_type}` : 'not found via API');

    await browser.$('ion-fab-button').waitForClickable({ timeout: 10_000 });
    await browser.$('ion-fab-button').click();
    await fillAndSaveActionModal({ deviceLabelSubstring: 'LR Light Check', actionTypeLabel: 'Turn off', delaySeconds: 5 });
    await capture('03-after-second-action');

    list = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number; action_type: string; sort_order: number; delay_seconds: number }> };
    const second = list.data?.find((a) => a.id !== actionIdA);
    actionIdB = second?.id ?? null;
    record('CRUD-2', 'Add second action', actionIdB != null && second?.delay_seconds === 5, second ? `id=${actionIdB}, delay=${second.delay_seconds}` : 'not found via API');
    record('CRUD-3', 'Two actions present, ordered', (list.data?.length ?? 0) === 2, `count=${list.data?.length}`);
  });

  it('reorders the two actions', async () => {
    if (!actionIdA || !actionIdB) {
      record('REORDER-1', 'Reorder actions', false, 'missing action ids from previous step');
      return;
    }

    const before = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number; sort_order: number }> };
    const firstCardWasActionA = before.data?.[0]?.id === actionIdA;

    await browser.$('.action-reorder-btn[aria-label="Move down"]').waitForClickable({ timeout: 10_000 });
    await browser.$('.action-reorder-btn[aria-label="Move down"]').click();
    await browser.pause(1500);
    await capture('04-after-reorder');

    const after = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number; sort_order: number }> };
    const orderFlipped = firstCardWasActionA
      ? after.data?.[0]?.id === actionIdB
      : after.data?.[0]?.id === actionIdA;
    record('REORDER-1', 'Move-down swaps order, persisted via API', orderFlipped === true, `before=${JSON.stringify(before.data)} after=${JSON.stringify(after.data)}`);
  });

  it('edits an action', async () => {
    if (!actionIdA) {
      record('EDIT-1', 'Edit action', false, 'no action id');
      return;
    }
    await navigateAppRouteSpa(`/scenes/${sceneId}/actions`);
    await browser.$('ion-title=Scene Actions').waitForExist({ timeout: 15_000 });
    await browser.pause(500);

    await browser.$('.action-card-body').waitForClickable({ timeout: 10_000 });
    await browser.$('.action-card-body').click();
    await browser.$('.action-modal').waitForExist({ timeout: 10_000 });
    await setDelay(42);
    const saveBtn = await browser.$('.action-modal ion-buttons[slot="end"] ion-button');
    await saveBtn.click();
    await browser.pause(1500);
    await capture('05-after-edit');

    const list = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number; delay_seconds: number }> };
    const edited = list.data?.find((a) => a.delay_seconds === 42);
    record('EDIT-1', 'Edit action delay via modal', edited != null, edited ? `id=${edited.id}, delay=42` : `no action with delay=42, data=${JSON.stringify(list.data)}`);
  });

  it('deletes an action', async () => {
    const before = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number }> };
    const beforeCount = before.data?.length ?? 0;

    await browser.$('.action-icon-btn.danger').waitForClickable({ timeout: 10_000 });
    await browser.$('.action-icon-btn.danger').click();
    await browser.$('button=Delete').waitForClickable({ timeout: 10_000 });
    await browser.$('button=Delete').click();
    await browser.pause(1500);
    await capture('06-after-delete');

    const after = apiJson('GET', `/api/scenes/${sceneId}/actions`) as { data?: Array<{ id: number }> };
    const afterCount = after.data?.length ?? -1;
    record('DELETE-1', 'Delete action', afterCount === beforeCount - 1, `before=${beforeCount} after=${afterCount}`);
  });
});
