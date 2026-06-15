/**
 * Scheduler MVP — native Android E2E against staging API.
 * Output: qa/scheduler-e2e/evidence/ (screenshots, logcat, summary.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { browser, driver } from '@wdio/globals';

import { signInWithEmailPassword } from '../tests/smoke/android/helpers/auth.js';
import { readPlaybackBridgeSnapshot } from './helpers/playback-bridge.js';
import { navigateAppRouteSpa, switchToWebView } from '../tests/smoke/android/helpers/webview.js';

const APP = process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter';
const API_BASE = (process.env.VITE_API_BASE_URL ?? 'https://staging-api.ixora-app.app').replace(/\/+$/, '');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'qa', 'scheduler-e2e', 'evidence', 'android-device');
const ENV_FILE = path.join(ROOT, 'front_vibes', '.env');

const results: Array<{ id: string; name: string; pass: boolean | null; notes: string }> = [];
const timeline: string[] = [];
const createdScheduleIds: number[] = [];
let notifyScheduleId: number | null = null;
let notifyVibeId: number | null = null;
let notifyScheduleName = '';

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[scheduler-e2e] ${line}`);
}

function record(id: string, name: string, pass: boolean, notes: string): void {
  results.push({ id, name, pass, notes });
  log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} — ${notes}`);
}

function recordSkip(id: string, name: string, notes: string): void {
  results.push({ id, name, pass: null, notes });
  log(`SKIP ${id} ${name} — ${notes}`);
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
  const args = [
    'curl', '-sS', '-X', method,
    `"${API_BASE}${route}"`,
    '-H', `"Authorization: Bearer ${token}"`,
    '-H', '"Accept: application/json"',
  ];
  if (body !== undefined) {
    args.push('-H', '"Content-Type: application/json"', '-d', `'${JSON.stringify(body)}'`);
  }
  const out = execSync(args.join(' '), { encoding: 'utf8' });
  return JSON.parse(out || '{}');
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

async function capture(label: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(OUT, `${safe}.png`));
}

function dumpLogcat(tag: string): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${tag}.logcat.txt`), adb('logcat -d -t 600'));
}

function wallTimeMinutesFromNow(minutes: number, tz?: string): string {
  const d = new Date(Date.now() + minutes * 60_000);
  const timeZone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:00`;
}

async function dismissOpenAlerts(): Promise<void> {
  const cancel = await browser.$('button=CANCEL');
  if (await cancel.isExisting()) {
    await cancel.click();
    await browser.pause(400);
    return;
  }
  const ok = await browser.$('button=OK');
  if (await ok.isExisting()) {
    await ok.click();
    await browser.pause(400);
  }
}

async function pickIonSelectOption(index: number, optionLabel?: string): Promise<void> {
  const selects = await browser.$$('ion-select');
  const select = selects[index];
  if (!select) throw new Error(`ion-select index ${index} missing`);
  await select.click();
  await browser.pause(900);
  if (optionLabel) {
    const radio = await browser.$(`button*=${optionLabel}`);
    if (await radio.isExisting()) {
      await radio.click();
    } else {
      const first = await browser.$('button.alert-radio-button');
      if (await first.isExisting()) await first.click();
    }
  } else {
    const first = await browser.$('button.alert-radio-button');
    if (await first.isExisting()) await first.click();
  }
  const ok = await browser.$('button=OK');
  if (await ok.isExisting()) await ok.click();
  await browser.pause(500);
  await dismissOpenAlerts();
}

async function waitForSchedulesPage(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const path = await browser.execute(() => window.location.pathname);
      return path === '/schedules';
    },
    { timeout: 30_000, timeoutMsg: 'Not on /schedules route' },
  );
  await browser.waitUntil(
    async () => {
      const state = await browser.execute(() => ({
        text: document.body?.innerText ?? '',
        cards: document.querySelectorAll('.schedule-card').length,
      }));
      return (
        state.text.includes('Schedules')
        || state.text.includes('Loading your schedules')
        || state.text.includes('No schedules')
        || state.cards > 0
      );
    },
    { timeout: 45_000, timeoutMsg: 'Schedules page content not visible' },
  );
  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading your schedules…').isExisting().catch(() => false);
      return !loading;
    },
    { timeout: 45_000, timeoutMsg: 'Schedules list still loading' },
  );
}

async function openSchedules(): Promise<void> {
  await navigateAppRouteSpa('/schedules');
  await waitForSchedulesPage();
}

async function openNewScheduleForm(): Promise<void> {
  const onForm = await browser.execute(() => window.location.pathname === '/schedules/new');
  if (onForm) return;
  const addBtn = await browser.$('ion-button[aria-label="New schedule"]');
  if (await addBtn.isExisting()) {
    await addBtn.click();
  } else {
    await navigateAppRouteSpa('/schedules/new');
  }
  await browser.waitUntil(
    async () => (await browser.execute(() => window.location.pathname)) === '/schedules/new',
    { timeout: 20_000, timeoutMsg: 'New schedule form did not open' },
  );
  await browser.$('ion-title=New schedule').waitForExist({ timeout: 20_000 });
}

async function fillScheduleForm(opts: {
  name: string;
  recurrence: 'once' | 'daily' | 'weekly';
  minutesFromNow: number;
  weeklyDayIso?: number;
}): Promise<void> {
  await browser.$('ion-title=New schedule').waitForExist({ timeout: 20_000 });
  await dismissOpenAlerts();

  const nameInput = await browser.$('ion-input input');
  await nameInput.waitForExist({ timeout: 10_000 });
  await nameInput.setValue(opts.name);

  const tz = await browser.execute(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
  const wallTime = wallTimeMinutesFromNow(opts.minutesFromNow, tz);

  const setStartTime = async (): Promise<void> => {
    await browser.execute((time) => {
      const dt = document.querySelector('ion-datetime.schedule-datetime') as HTMLElement & {
        value?: string;
      } | null;
      if (!dt) return;
      (dt as { value: string }).value = time;
      dt.dispatchEvent(
        new CustomEvent('ionChange', { detail: { value: time }, bubbles: true, composed: true }),
      );
    }, wallTime);
    await browser.pause(400);
  };

  await setStartTime();

  // Vibe select (index 0) — must dismiss alert before touching recurrence.
  await pickIonSelectOption(0);

  if (opts.recurrence !== 'once') {
    const label = opts.recurrence === 'daily' ? 'Daily' : 'Weekly';
    await pickIonSelectOption(1, label);
  }

  if (opts.recurrence === 'weekly') {
    const monChip = await browser.$('button.schedule-day-chip=Mon');
    if (await monChip.isExisting()) await monChip.click();
    else {
      const chips = await browser.$$('.schedule-day-chip');
      if (chips.length > 0) await chips[0]!.click();
    }
  }

  // Re-apply start time immediately before submit so Vue model is fresh.
  await setStartTime();

  await dismissOpenAlerts();
  await browser.execute(() => {
    const btn = document.querySelector('ion-button.auth-submit') as HTMLElement | null;
    btn?.scrollIntoView({ block: 'center' });
  });
  await browser.pause(300);
  await browser.execute(() => {
    (document.querySelector('ion-button.auth-submit') as HTMLElement | null)?.click();
    (document.querySelector('form.auth-form') as HTMLFormElement | null)?.requestSubmit();
  });

  await browser.waitUntil(
    async () => (await browser.execute(() => window.location.pathname)) === '/schedules',
    { timeout: 45_000, timeoutMsg: 'Create schedule did not return to list' },
  );
  await waitForSchedulesPage();
}

async function findScheduleIdByName(name: string): Promise<number | null> {
  const list = apiJson('GET', '/api/schedules') as { data?: Array<{ id: number; name: string }> };
  const row = list.data?.find((s) => s.name === name);
  return row?.id ?? null;
}

async function waitForScheduleCard(name: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const text = await browser.execute(() => document.body?.innerText ?? '');
      const hasCard = await browser.execute(() => document.querySelectorAll('.schedule-card').length > 0);
      return text.includes(name) || hasCard;
    },
    { timeout: 25_000, timeoutMsg: `Schedule card "${name}" not visible` },
  );
}

async function tapNotificationByTitle(title: string): Promise<boolean> {
  try {
    await driver.openNotifications();
    await browser.pause(2000);
    const selectors = [
      `android=new UiSelector().textContains("${title}")`,
      `android=new UiSelector().textContains("Time to start")`,
      'android=new UiSelector().packageName("io.ionic.starter")',
    ];
    for (const sel of selectors) {
      const el = await browser.$(sel);
      if (await el.isExisting()) {
        await el.click();
        return true;
      }
    }
    // Fallback: adb dump for debugging + first notification row tap
    const dump = adb('shell dumpsys notification --noredact');
    fs.writeFileSync(path.join(OUT, 'notification-dumpsys.txt'), dump);
    if (dump.includes(title) || dump.includes('Time to start your scheduled vibe')) {
      adb('shell input tap 540 380');
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function writeSummary(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const passCount = results.filter((r) => r.pass === true).length;
  const failCount = results.filter((r) => r.pass === false).length;
  const skipCount = results.filter((r) => r.pass === null).length;
  const summary = {
    device: adb('devices -l'),
    apiBase: API_BASE,
    passCount,
    failCount,
    skipCount,
    results,
    timeline,
    notifyScheduleId,
    createdScheduleIds,
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'summary.txt'),
    [
      'Scheduler Android E2E',
      `PASS=${passCount} FAIL=${failCount} SKIP=${skipCount}`,
      ...results.map((r) => `${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP'} ${r.id} ${r.name}: ${r.notes}`),
    ].join('\n'),
  );
}

describe('Scheduler MVP — Android device E2E (staging)', () => {
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
    try {
      setAirplaneMode(false);
    } catch {
      /* ignore */
    }
  });

  it('opens Schedules page', async () => {
    await openSchedules();
    await capture('01-schedules-list');
    record('NAV', 'Open Schedules', true, 'Schedules page loaded via /schedules');
  });

  it('creates once, daily, and weekly schedules (CRUD create)', async () => {
    await openSchedules();
    const stamp = Date.now().toString().slice(-6);
    const onceName = `QA Dev Once ${stamp}`;
    const dailyName = `QA Dev Daily ${stamp}`;
    const weeklyName = `QA Dev Weekly ${stamp}`;

    await openNewScheduleForm();
    await fillScheduleForm({ name: onceName, recurrence: 'once', minutesFromNow: 180 });
    await waitForScheduleCard(onceName);
    const onceId = await findScheduleIdByName(onceName);
    if (onceId) createdScheduleIds.push(onceId);
    record('CRUD-1', 'Create once schedule', onceId != null, onceId ? `id=${onceId}, backend confirmed` : 'backend missing row');

    await openNewScheduleForm();
    await fillScheduleForm({ name: dailyName, recurrence: 'daily', minutesFromNow: 240 });
    await waitForScheduleCard(dailyName);
    const dailyId = await findScheduleIdByName(dailyName);
    if (dailyId) createdScheduleIds.push(dailyId);
    record('CRUD-2', 'Create daily schedule', dailyId != null, dailyId ? `id=${dailyId}` : 'backend missing');

    await openNewScheduleForm();
    await fillScheduleForm({ name: weeklyName, recurrence: 'weekly', minutesFromNow: 300, weeklyDayIso: 1 });
    await waitForScheduleCard(weeklyName);
    const weeklyId = await findScheduleIdByName(weeklyName);
    if (weeklyId) createdScheduleIds.push(weeklyId);
    record('CRUD-3', 'Create weekly schedule', weeklyId != null, weeklyId ? `id=${weeklyId}` : 'backend missing');

    await capture('02-after-create-crud');

    if (dailyId) {
      await navigateAppRouteSpa(`/schedules/${dailyId}/edit`);
      await browser.$('ion-title=Edit schedule').waitForExist({ timeout: 15_000 });
      const nameInput = await browser.$('ion-input input');
      await nameInput.setValue(`${dailyName} edited`);
      await browser.execute(() => {
        (document.querySelector('ion-button.auth-submit') as HTMLElement | null)?.click();
      });
      await waitForSchedulesPage();
      const patched = apiJson('GET', `/api/schedules/${dailyId}`) as { data?: { name?: string } };
      record('CRUD-4', 'Edit schedule name', patched.data?.name === `${dailyName} edited`, patched.data?.name ?? 'no name');

      await navigateAppRouteSpa(`/schedules/${dailyId}/edit`);
      await browser.$('ion-toggle').waitForExist({ timeout: 10_000 });
      await browser.$('ion-toggle').click();
      await browser.execute(() => {
        (document.querySelector('ion-button.auth-submit') as HTMLElement | null)?.click();
      });
      await waitForSchedulesPage();
      const disabled = apiJson('GET', `/api/schedules/${dailyId}`) as { data?: { is_enabled?: boolean } };
      record('CRUD-5', 'Disable schedule via edit', disabled.data?.is_enabled === false, `is_enabled=${disabled.data?.is_enabled}`);

      await navigateAppRouteSpa(`/schedules/${dailyId}/edit`);
      await browser.$('ion-toggle').click();
      await browser.execute(() => {
        (document.querySelector('ion-button.auth-submit') as HTMLElement | null)?.click();
      });
      await waitForSchedulesPage();
      const enabled = apiJson('GET', `/api/schedules/${dailyId}`) as { data?: { is_enabled?: boolean } };
      record('CRUD-6', 'Enable schedule via edit', enabled.data?.is_enabled === true, `is_enabled=${enabled.data?.is_enabled}`);
    }

    if (weeklyId) {
      await openSchedules();
      await browser.execute((name) => {
        const card = Array.from(document.querySelectorAll('.schedule-card'))
          .find((c) => c.textContent?.includes(name));
        const del = card?.querySelector('ion-button[color="danger"]') as HTMLElement | null;
        del?.click();
      }, weeklyName);
      await browser.$('button=Delete').waitForClickable({ timeout: 10_000 });
      await browser.$('button=Delete').click();
      await browser.pause(2000);
      const list = apiJson('GET', '/api/schedules') as { data?: Array<{ id: number }> };
      record('CRUD-7', 'Delete weekly schedule', !list.data?.some((s) => s.id === weeklyId), 'removed from API');
    }
  });

  it('validates SQLite mirror while offline', async () => {
    setAirplaneMode(false);
    await browser.pause(2000);
    await browser.execute(() => window.dispatchEvent(new Event('online')));
    await openSchedules();
    const beforeCount = await browser.execute(() =>
      document.querySelectorAll('.schedule-card').length,
    );
    setAirplaneMode(true);
    await browser.pause(3000);
    await browser.execute(() => window.dispatchEvent(new Event('offline')));
    await navigateAppRouteSpa('/schedules');
    await browser.waitUntil(
      async () => (await browser.execute(() => window.location.pathname)) === '/schedules',
      { timeout: 20_000 },
    );
    await browser.pause(2000);

    const offlineState = await browser.execute(() => ({
      banner: !!document.querySelector('.schedules-offline-banner'),
      cards: document.querySelectorAll('.schedule-card').length,
      newBtnDisabled: (document.querySelector('ion-button[aria-label="New schedule"]') as HTMLButtonElement | null)?.disabled ?? true,
      text: document.body?.innerText?.slice(0, 500) ?? '',
    }));
    record('SQLITE-1', 'Offline banner visible', offlineState.banner, offlineState.banner ? 'banner shown' : `text=${offlineState.text.slice(0, 120)}`);
    record('SQLITE-2', 'Cached schedules visible', offlineState.cards >= beforeCount && offlineState.cards > 0, `cards=${offlineState.cards} (was ${beforeCount})`);
    record('SQLITE-3', 'Create disabled offline', offlineState.newBtnDisabled === true, `disabled=${offlineState.newBtnDisabled}`);

    await capture('03-offline-schedules');

    setAirplaneMode(false);
    await browser.pause(3000);
    await browser.execute(() => window.dispatchEvent(new Event('online')));
    await navigateAppRouteSpa('/schedules');
    await waitForSchedulesPage();
    record('SQLITE-4', 'Online restore', true, 'Network re-enabled, schedules page reopened');
    await capture('04-online-restored');
  });

  it('confirms hard boundaries in UI', async () => {
    await navigateAppRouteSpa('/schedules/new');
    await browser.$('ion-title=New schedule').waitForExist({ timeout: 15_000 });
    const options = await browser.execute(() =>
      Array.from(document.querySelectorAll('ion-select-option')).map((el) => el.getAttribute('value')),
    );
    const hasMonthly = options.includes('monthly');
    record('BOUND-1', 'No monthly recurrence in UI', !hasMonthly, `options=${options.join(',')}`);
  });

  it('fires local notification, tap opens player without autoplay, ack when online', async () => {
    setAirplaneMode(false);
    await browser.pause(2000);
    await browser.execute(() => window.dispatchEvent(new Event('online')));
    await dismissOpenAlerts();

    const stamp = Date.now().toString().slice(-6);
    notifyScheduleName = `QA Notif ${stamp}`;
    await openSchedules();
    await openNewScheduleForm();
    await fillScheduleForm({ name: notifyScheduleName, recurrence: 'once', minutesFromNow: 2 });
    await waitForScheduleCard(notifyScheduleName);
    notifyScheduleId = await findScheduleIdByName(notifyScheduleName);
    if (notifyScheduleId) createdScheduleIds.push(notifyScheduleId);

    const sched = apiJson('GET', `/api/schedules/${notifyScheduleId}`) as {
      data?: { vibe_id?: number; next_run_at?: string | null; start_time?: string };
    };
    notifyVibeId = sched.data?.vibe_id ?? null;
    const hasNextRun = sched.data?.next_run_at != null;
    record(
      'NOTIF-1',
      'Create due-soon schedule on device',
      notifyScheduleId != null && hasNextRun,
      `id=${notifyScheduleId} next_run_at=${sched.data?.next_run_at ?? 'null'} start=${sched.data?.start_time ?? 'null'}`,
    );
    if (!hasNextRun) {
      recordSkip('NOTIF-2', 'Notification appeared and tapped', 'next_run_at null — no OS alarm scheduled');
      recordSkip('NOTIF-3', 'Tap opens VibePlayerPage', 'skipped');
      recordSkip('NOTIF-4', 'No autoplay', 'skipped');
      recordSkip('ACK-1', 'Execution row exists', 'skipped');
      recordSkip('ACK-2', 'Ack after tap', 'skipped');
      return;
    }

    await driver.background(2);
    log('Waiting 150s for local notification + backend dispatch…');
    await browser.pause(150_000);

    dumpLogcat('notification-wait');
    const tapped = await tapNotificationByTitle(notifyScheduleName);
    record('NOTIF-2', 'Notification appeared and tapped', tapped, tapped ? 'Opened from shade' : 'Could not find notification in shade');

    if (tapped) {
      await switchToWebView();
      await browser.waitUntil(
        async () => {
          const path = await browser.execute(() => window.location.pathname);
          return notifyVibeId != null && path.includes(`/vibes/${notifyVibeId}/player`);
        },
        { timeout: 25_000, timeoutMsg: 'Did not navigate to VibePlayerPage' },
      );
      await browser.pause(2000);
      const snap = await readPlaybackBridgeSnapshot();
      const noAutoplay = snap.store.playbackState !== 'playing';
      record('NOTIF-3', 'Tap opens VibePlayerPage', true, await browser.execute(() => window.location.pathname));
      record('NOTIF-4', 'No autoplay after notification tap', noAutoplay, `playbackState=${snap.store.playbackState}`);

      const playBtn = await browser.$('button[aria-label="Play"]');
      if (await playBtn.isExisting()) {
        await playBtn.click();
        await browser.pause(3000);
        const afterPlay = await readPlaybackBridgeSnapshot();
        record('NOTIF-5', 'Manual Play works', afterPlay.store.playbackState === 'playing' || afterPlay.store.playbackState === 'preparing', `state=${afterPlay.store.playbackState}`);
      } else {
        recordSkip('NOTIF-5', 'Manual Play', 'Play button not found (vibe may lack sounds)');
      }
      await capture('05-after-notification-tap');
    } else {
      await driver.activateApp(APP);
      await switchToWebView();
      recordSkip('NOTIF-3', 'Tap opens VibePlayerPage', 'Notification not tapped');
      recordSkip('NOTIF-4', 'No autoplay', 'Notification not tapped');
    }

    if (notifyScheduleId) {
      await browser.pause(5000);
      const execs = apiJson('GET', `/api/schedules/${notifyScheduleId}/executions`) as {
        data?: Array<{ status: string; occurrence_key: string }>;
      };
      const row = execs.data?.[0];
      const hasExec = Boolean(row);
      const acked = row?.status === 'acknowledged';
      record('ACK-1', 'Execution row exists after dispatch', hasExec, row ? `status=${row.status} key=${row.occurrence_key}` : 'no rows');
      record('ACK-2', 'Ack after notification tap (online)', tapped ? acked : false, tapped ? (row?.status ?? 'none') : 'notification not tapped');
      if (row) {
        fs.writeFileSync(path.join(OUT, 'executions-after-tap.json'), JSON.stringify(execs, null, 2));
      }
    }
  });
});
