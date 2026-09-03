/**
 * Vibe ↔ Scene link (v1.3.0-T15) — native Android E2E against staging API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { browser } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import { navigateAppRouteSpa, switchToWebView } from '../tests/smoke/android/helpers/webview.js';

const API_BASE = (process.env.VITE_API_BASE_URL ?? 'https://staging-api.ixora-app.app').replace(/\/+$/, '');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa', 'vibe-scene-picker-e2e', 'evidence', 'android-device');
const ENV_FILE = path.join(ROOT, '.env.staging');

const stamp = Date.now();
const sceneName = `E2E Scene ${stamp}`;
const vibeName = `E2E Vibe ${stamp}`;

const results: Array<{ id: string; name: string; pass: boolean; notes: string }> = [];
let createdSceneId: number | null = null;
let createdVibeId: number | null = null;

function log(msg: string): void {
  console.log(`[vibe-scene-picker-e2e] ${msg}`);
}

function record(id: string, name: string, pass: boolean, notes: string): void {
  results.push({ id, name, pass, notes });
  log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} — ${notes}`);
}

function envVar(key: string): string {
  if (process.env[key]?.trim()) return process.env[key]!.trim();
  for (const file of [ENV_FILE, path.join(ROOT, '.env')]) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
    if (line) return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  }
  throw new Error(`Missing ${key} in env`);
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
  const payload = body != null ? `-d '${JSON.stringify(body)}'` : '';
  const out = execSync(
    `curl -sS -X ${method} "${API_BASE}${route}" `
    + `-H "Authorization: Bearer ${token}" -H "Accept: application/json" `
    + `-H "Content-Type: application/json" ${payload}`,
    { encoding: 'utf8' },
  );
  return JSON.parse(out || '{}');
}

async function dismissOpenAlerts(): Promise<void> {
  const cancel = await browser.$('button=CANCEL');
  if (await cancel.isExisting()) {
    await cancel.click();
    await browser.pause(400);
  }
}

async function pickSceneOption(label: string): Promise<void> {
  const select = await browser.$('ion-select');
  await select.waitForExist({ timeout: 15_000 });
  await select.click();
  await browser.pause(900);
  const option = await browser.$(`button*=${label}`);
  if (await option.isExisting()) {
    await option.click();
  } else {
    throw new Error(`Scene option "${label}" not found in action sheet`);
  }
  const ok = await browser.$('button=OK');
  if (await ok.isExisting()) await ok.click();
  await browser.pause(500);
  await dismissOpenAlerts();
}

function writeSummary(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.filter((r) => !r.pass).length;
  fs.writeFileSync(
    path.join(OUT, 'summary.json'),
    JSON.stringify({ apiBase: API_BASE, passCount, failCount, results, createdSceneId, createdVibeId }, null, 2),
  );
}

describe('Vibe scene picker (v1.3.0-T15) — Android device E2E (staging)', () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await switchToWebView();
    await signInWithEmailPassword();
    record('BOOT', 'Sign-in', true, 'Authenticated');
  });

  after(() => {
    if (createdVibeId != null) {
      try {
        apiJson('DELETE', `/api/vibes/${createdVibeId}`);
      } catch {
        // best-effort cleanup
      }
    }
    if (createdSceneId != null) {
      try {
        apiJson('DELETE', `/api/scenes/${createdSceneId}`);
      } catch {
        // best-effort cleanup
      }
    }
    writeSummary();
  });

  it('creates a vibe linked to an existing scene', async () => {
    const sceneResp = apiJson('POST', '/api/scenes', { name: sceneName, description: 'E2E scene for vibe link' }) as {
      data?: { id: number };
    };
    createdSceneId = sceneResp.data?.id ?? null;
    if (createdSceneId == null) {
      record('SETUP', 'Create scene via API', false, JSON.stringify(sceneResp));
      throw new Error('Failed to create scene via API');
    }
    record('SETUP', 'Create scene via API', true, `scene_id=${createdSceneId}`);

    await navigateAppRouteSpa('/vibes/create');
    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/vibes/create',
      { timeout: 20_000 },
    );

    await browser.execute((name) => {
      const input = document.querySelector('.tab-page:not(.ion-page-hidden) ion-input input') as HTMLInputElement | null;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      const ionInputEl = input.closest('ion-input');
      ionInputEl?.dispatchEvent(new CustomEvent('ionInput', { detail: { value: name }, bubbles: true, composed: true }));
      ionInputEl?.dispatchEvent(new CustomEvent('ionChange', { detail: { value: name }, bubbles: true, composed: true }));
    }, vibeName);
    await browser.pause(300);

    await pickSceneOption(sceneName);

    const hasManageLink = await browser.execute(() =>
      Array.from(document.querySelectorAll('ion-button')).some((b) => b.textContent?.includes('Manage scene actions')),
    );
    if (!hasManageLink) {
      record('UI-1', 'Manage scene actions link visible after selection', false, 'link not found');
      throw new Error('Manage scene actions link not visible');
    }
    record('UI-1', 'Manage scene actions link visible after selection', true, 'link shown');

    await browser.execute(() => {
      (document.querySelector('.tab-page:not(.ion-page-hidden) ion-button.auth-submit') as HTMLElement | null)?.click();
    });
    await browser.pause(2500);

    const vibes = apiJson('GET', '/api/vibes') as { data?: Array<{ id: number; name: string; scene_id?: number | null }> };
    const row = vibes.data?.find((v) => v.name === vibeName);
    createdVibeId = row?.id ?? null;

    if (createdVibeId == null || row?.scene_id !== createdSceneId) {
      record('API-1', 'Vibe persisted with scene_id', false, JSON.stringify(row));
      throw new Error('Vibe scene_id mismatch');
    }
    record('API-1', 'Vibe persisted with scene_id', true, `vibe_id=${createdVibeId} scene_id=${row.scene_id}`);
  });

  it('edit page exposes link to manage scene actions', async () => {
    if (createdVibeId == null) throw new Error('Missing created vibe');

    await navigateAppRouteSpa(`/vibes/${createdVibeId}/edit`);
    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === `/vibes/${createdVibeId}/edit`,
      { timeout: 20_000 },
    );
    await browser.pause(1500);

    const hasLink = await browser.execute(() =>
      Array.from(document.querySelectorAll('ion-button')).some((b) => b.textContent?.includes('Manage scene actions')),
    );
    if (!hasLink) {
      record('UI-2', 'Edit page shows manage actions link', false, 'link missing');
      throw new Error('Edit page missing manage link');
    }

    await browser.execute(() => {
      const btn = Array.from(document.querySelectorAll('ion-button')).find((b) =>
        b.textContent?.includes('Manage scene actions'),
      ) as HTMLElement | undefined;
      btn?.click();
    });
    await browser.pause(1500);

    const pathOk = await browser.waitUntil(
      async () => {
        const path = await browser.execute(() => window.location.pathname);
        return typeof path === 'string' && path.includes('/actions');
      },
      { timeout: 15_000, timeoutMsg: 'Did not navigate to scene actions' },
    );
    record('UI-2', 'Edit page navigates to scene actions', !!pathOk, `path=${await browser.execute(() => window.location.pathname)}`);
  });
});
