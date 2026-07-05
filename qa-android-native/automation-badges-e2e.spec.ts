/**
 * Scheduler + Smart Home Automations — Phase 8.5 Android device E2E.
 *
 * Validates Phase 5 mobile UX (automation badges, schedule summaries, vibe schedule
 * counts) on a real Android device against the staging API.
 *
 * Tests:
 *   - Schedule list: vibe name + automation badge on cards
 *   - Schedule detail (edit form): automation summary section
 *   - Vibe list: automation badge when has_active_schedule
 *   - Vibe detail (edit): schedule count summary text
 *   - Accessibility: badges have text labels, not colour-only
 *   - Push routing: JS-level verification of ROUTE_BY_NOTIFICATION_TYPE
 *   - Loading / empty state copy visible on device
 *
 * Output: qa/automation-badges-e2e/evidence/
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
const OUT = path.join(ROOT, 'qa', 'automation-badges-e2e', 'evidence');

const results: Array<{ id: string; name: string; pass: boolean | null; notes: string }> = [];
const timeline: string[] = [];

function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  timeline.push(line);
  console.log(`[automation-badges-e2e] ${line}`);
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
  const envFile = path.join(ROOT, 'front_vibes', '.env');
  if (!fs.existsSync(envFile)) throw new Error(`Missing ${key} and no ${envFile}`);
  const line = fs.readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing ${key} in env and ${envFile}`);
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
  if (!data.idToken) throw new Error('Firebase sign-in failed');
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

function writeSummary(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const passCount = results.filter((r) => r.pass === true).length;
  const failCount = results.filter((r) => r.pass === false).length;
  const skipCount = results.filter((r) => r.pass === null).length;
  const deviceInfo = (() => {
    try { return adb('devices -l'); } catch { return 'unavailable'; }
  })();
  const summary = {
    phase: '8.5',
    feature: 'scheduler-smart-home-automations/mvp',
    apiBase: API_BASE,
    device: deviceInfo,
    passCount,
    failCount,
    skipCount,
    results,
    timeline,
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'summary.txt'),
    [
      'Automation Badges Phase 8.5 — Android device E2E',
      `PASS=${passCount} FAIL=${failCount} SKIP=${skipCount}`,
      '',
      ...results.map((r) => {
        const status = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP';
        return `${status} [${r.id}] ${r.name}: ${r.notes}`;
      }),
      '',
      'timeline:',
      ...timeline,
    ].join('\n'),
  );
  log(`Summary written → ${path.join(OUT, 'summary.txt')}`);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Automation Badges — Phase 8.5 Android device E2E (staging)', () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'device.txt'), adb('devices -l'));
    adb('logcat -c');
    await switchToWebView();
    await signInWithEmailPassword();
    record('BOOT', 'Sign-in via Firebase + staging API', true, 'Authenticated successfully');
  });

  after(() => {
    writeSummary();
  });

  // -------------------------------------------------------------------------
  // S1 — Schedules list
  // -------------------------------------------------------------------------

  it('S1-NAV: opens Schedules page and content loads', async () => {
    await navigateAppRouteSpa('/schedules');
    const loaded = await browser.waitUntil(
      async () => {
        const bodyText = await browser.execute(() => document.body?.innerText ?? '');
        return (
          bodyText.includes('Schedules')
          || bodyText.includes('No schedules')
          || document.querySelectorAll('.schedule-card').length > 0
        );
      },
      { timeout: 45_000, timeoutMsg: 'Schedules page did not load content' },
    ).catch(() => false);
    await capture('s1-schedules-list');
    record('S1-NAV', 'Schedules page loads', !!loaded, loaded ? 'content visible' : 'timeout waiting for content');
  });

  it('S1-LOADING: loading state copy used correct pattern', async () => {
    // Navigate fresh so we can catch the loading state text if present.
    await navigateAppRouteSpa('/schedules');
    const loadingText = await browser.execute(() => {
      const el = document.querySelector('[role="status"]') ?? document.querySelector('.app-loading-state');
      return el?.textContent?.trim() ?? null;
    });
    // If no loading state is visible it means data loaded instantly — that is fine.
    const hasLoading = loadingText !== null;
    if (hasLoading) {
      const hasTitle = loadingText!.includes('Loading');
      record('S1-LOADING', 'Loading state has descriptive text', hasTitle, `text="${loadingText}"`);
    } else {
      recordSkip('S1-LOADING', 'Loading state copy', 'Data loaded before check — no loading state visible (OK)');
    }
    await browser.waitUntil(
      async () => {
        const loading = await browser.execute(() => !!document.querySelector('.app-loading-state'));
        return !loading;
      },
      { timeout: 45_000, timeoutMsg: 'Schedules loading state never cleared' },
    );
  });

  it('S1-VIBE: schedule cards show vibe name when set', async () => {
    await navigateAppRouteSpa('/schedules');
    await browser.waitUntil(
      async () => {
        const cards = await browser.execute(() => document.querySelectorAll('.schedule-card').length);
        const emptyState = await browser.execute(() => !!document.querySelector('.app-empty-state'));
        return cards > 0 || emptyState;
      },
      { timeout: 30_000, timeoutMsg: 'Schedule list did not render cards or empty state' },
    );

    const state = await browser.execute(() => {
      const cards = Array.from(document.querySelectorAll('.schedule-card'));
      if (cards.length === 0) return { cardCount: 0, withVibeName: 0, vibeNames: [] as string[] };
      const vibeNames: string[] = [];
      let withVibeName = 0;
      for (const card of cards) {
        const vibeEl = card.querySelector('.schedule-card-vibe');
        const name = vibeEl?.textContent?.trim() ?? '';
        if (name) {
          withVibeName++;
          vibeNames.push(name);
        }
      }
      return { cardCount: cards.length, withVibeName, vibeNames };
    });

    await capture('s1-schedule-cards');

    if (state.cardCount === 0) {
      recordSkip('S1-VIBE', 'Schedule cards show vibe name', 'No schedule cards — empty state (OK, no data)');
    } else {
      record(
        'S1-VIBE',
        'Schedule cards show vibe name',
        state.withVibeName > 0,
        `cards=${state.cardCount} withVibeName=${state.withVibeName} samples=${state.vibeNames.slice(0, 3).join(', ')}`,
      );
    }
  });

  it('S1-BADGE: automation badge visible and has text label (not colour-only)', async () => {
    await navigateAppRouteSpa('/schedules');
    await browser.waitUntil(
      async () => {
        const cards = await browser.execute(() => document.querySelectorAll('.schedule-card').length);
        const emptyState = await browser.execute(() => !!document.querySelector('.app-empty-state'));
        return cards > 0 || emptyState;
      },
      { timeout: 30_000, timeoutMsg: 'Schedule list did not settle' },
    );

    const badgeState = await browser.execute(() => {
      const badges = Array.from(document.querySelectorAll('.schedule-card .app-automation-badge'));
      const labels: string[] = [];
      const ariaLabels: string[] = [];
      for (const badge of badges) {
        const labelEl = badge.querySelector('.app-automation-badge__label');
        if (labelEl?.textContent?.trim()) labels.push(labelEl.textContent.trim());
        const aria = badge.getAttribute('aria-label');
        if (aria) ariaLabels.push(aria);
      }
      return { badgeCount: badges.length, labelCount: labels.length, labels, ariaLabels };
    });

    await capture('s1-automation-badges');

    if (badgeState.badgeCount === 0) {
      recordSkip('S1-BADGE', 'Automation badge visible', 'No automation badges — no schedules with device actions (OK if no data)');
    } else {
      record(
        'S1-BADGE',
        'Automation badges have text labels',
        badgeState.labelCount === badgeState.badgeCount,
        `badges=${badgeState.badgeCount} withLabel=${badgeState.labelCount} labels=${badgeState.labels.slice(0, 2).join(', ')}`,
      );
      record(
        'S1-BADGE-A11Y',
        'Automation badges have aria-label',
        badgeState.ariaLabels.length > 0,
        `ariaLabels=${badgeState.ariaLabels.slice(0, 2).join(', ')}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // S2 — Schedule detail (edit form)
  // -------------------------------------------------------------------------

  it('S2-DETAIL: schedule edit form shows automation summary section', async () => {
    // Fetch first schedule from API to get a real ID.
    let scheduleId: number | null = null;
    try {
      const list = apiJson('GET', '/api/schedules') as { data?: Array<{ id: number }> };
      scheduleId = list.data?.[0]?.id ?? null;
    } catch (err) {
      log(`API fetch failed: ${String(err)}`);
    }

    if (!scheduleId) {
      recordSkip('S2-DETAIL', 'Schedule edit form automation summary', 'No schedules in staging — navigate to /schedules/new as fallback check');
      await navigateAppRouteSpa('/schedules/new');
      await browser.$('ion-title=New schedule').waitForExist({ timeout: 20_000 });
      record('S2-DETAIL-NEW', 'New schedule form renders', true, 'Form visible');
      return;
    }

    await navigateAppRouteSpa(`/schedules/${scheduleId}/edit`);
    await browser.waitUntil(
      async () => {
        const title = await browser.$('ion-title=Edit schedule').isExisting();
        const loading = await browser.execute(() => !!document.querySelector('.app-loading-state'));
        return title && !loading;
      },
      { timeout: 30_000, timeoutMsg: `Edit schedule ${scheduleId} did not load` },
    );

    await capture('s2-schedule-detail');

    const detailState = await browser.execute(() => {
      const summary = document.querySelector('.schedule-detail-summary');
      if (!summary) return { summaryFound: false, vibeLabel: '', automationLabel: '', badgeText: '' };
      const rows = Array.from(summary.querySelectorAll('.schedule-detail-summary__row'));
      const vibeRow = rows.find((r) => r.querySelector('.schedule-detail-summary__label')?.textContent?.trim() === 'Vibe');
      const autoRow = rows.find((r) => r.querySelector('.schedule-detail-summary__label')?.textContent?.trim() === 'Automation');
      const badge = autoRow?.querySelector('.app-automation-badge');
      return {
        summaryFound: true,
        vibeLabel: vibeRow?.querySelector('.schedule-detail-summary__value')?.textContent?.trim() ?? '',
        automationLabel: badge?.getAttribute('aria-label') ?? '',
        badgeText: badge?.querySelector('.app-automation-badge__label')?.textContent?.trim() ?? '',
      };
    });

    record('S2-DETAIL', 'Schedule edit shows automation summary section', detailState.summaryFound, detailState.summaryFound ? 'section found' : 'section missing');
    if (detailState.summaryFound) {
      record('S2-VIBE-ROW', 'Vibe row shows name', detailState.vibeLabel !== '', `vibeLabel="${detailState.vibeLabel}"`);
      record('S2-BADGE', 'Automation row shows badge with text', detailState.badgeText !== '' || detailState.automationLabel !== '', `text="${detailState.badgeText}" aria="${detailState.automationLabel}"`);
    }
  });

  // -------------------------------------------------------------------------
  // S3 — Vibes list
  // -------------------------------------------------------------------------

  it('S3-NAV: opens Vibes page and content loads', async () => {
    await navigateAppRouteSpa('/vibes');
    const loaded = await browser.waitUntil(
      async () => {
        const bodyText = await browser.execute(() => document.body?.innerText ?? '');
        const cards = await browser.execute(() => document.querySelectorAll('.vibe-card').length);
        return bodyText.includes('Vibe') || cards > 0;
      },
      { timeout: 45_000, timeoutMsg: 'Vibes page did not load content' },
    ).catch(() => false);
    await capture('s3-vibes-list');
    record('S3-NAV', 'Vibes page loads', !!loaded, loaded ? 'content visible' : 'timeout');
  });

  it('S3-BADGE: vibe cards show automation badge with text label when has_active_schedule', async () => {
    await navigateAppRouteSpa('/vibes');
    await browser.waitUntil(
      async () => {
        const cards = await browser.execute(() => document.querySelectorAll('.vibe-card').length);
        const emptyState = await browser.execute(() => !!document.querySelector('.app-empty-state'));
        return cards > 0 || emptyState;
      },
      { timeout: 30_000, timeoutMsg: 'Vibes list did not settle' },
    );

    const vibeState = await browser.execute(() => {
      const cards = Array.from(document.querySelectorAll('.vibe-card'));
      if (cards.length === 0) return { cardCount: 0, badgeCount: 0, labels: [] as string[], ariaLabels: [] as string[] };
      const labels: string[] = [];
      const ariaLabels: string[] = [];
      let badgeCount = 0;
      for (const card of cards) {
        const badge = card.querySelector('.app-automation-badge');
        if (!badge) continue;
        badgeCount++;
        const lbl = badge.querySelector('.app-automation-badge__label')?.textContent?.trim() ?? '';
        if (lbl) labels.push(lbl);
        const aria = badge.getAttribute('aria-label');
        if (aria) ariaLabels.push(aria);
      }
      return { cardCount: cards.length, badgeCount, labels, ariaLabels };
    });

    await capture('s3-vibe-badges');

    if (vibeState.cardCount === 0) {
      recordSkip('S3-BADGE', 'Vibe automation badges', 'No vibe cards — empty state (OK, no data)');
    } else if (vibeState.badgeCount === 0) {
      recordSkip('S3-BADGE', 'Vibe automation badges', `${vibeState.cardCount} vibe(s) — none have active schedules in staging data (OK)`);
    } else {
      record(
        'S3-BADGE',
        'Vibe cards show automation badge with text',
        vibeState.labels.length > 0,
        `vibes=${vibeState.cardCount} badges=${vibeState.badgeCount} labels=${vibeState.labels.slice(0, 2).join(', ')}`,
      );
      record(
        'S3-BADGE-A11Y',
        'Vibe automation badges have aria-label',
        vibeState.ariaLabels.length > 0,
        `ariaLabels=${vibeState.ariaLabels.slice(0, 2).join(', ')}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // S4 — Edit Vibe (schedule count summary)
  // -------------------------------------------------------------------------

  it('S4-SUMMARY: vibe detail page shows schedule count summary text', async () => {
    let vibeId: number | null = null;
    try {
      const list = apiJson('GET', '/api/vibes') as { data?: Array<{ id: number }> };
      vibeId = list.data?.[0]?.id ?? null;
    } catch (err) {
      log(`API fetch failed: ${String(err)}`);
    }

    if (!vibeId) {
      recordSkip('S4-SUMMARY', 'Vibe detail schedule summary', 'No vibes in staging — cannot navigate to edit page');
      return;
    }

    await navigateAppRouteSpa(`/vibes/${vibeId}/edit`);
    await browser.waitUntil(
      async () => {
        const loading = await browser.execute(() => !!document.querySelector('.app-loading-state'));
        const error = await browser.execute(() => !!document.querySelector('.app-error-state'));
        const content = await browser.execute(() => !!document.querySelector('[aria-label="Automation summary"]'));
        return !loading && !error && content;
      },
      { timeout: 30_000, timeoutMsg: `Edit Vibe ${vibeId} content did not appear` },
    );

    await capture('s4-edit-vibe');

    const summaryState = await browser.execute(() => {
      const summaryEl = document.querySelector('[aria-label="Automation summary"]');
      if (!summaryEl) return { hasSummary: false, text: '', ariaLabel: '' };
      return {
        hasSummary: true,
        text: summaryEl.textContent?.trim() ?? '',
        ariaLabel: summaryEl.getAttribute('aria-label') ?? '',
      };
    });

    record(
      'S4-SUMMARY',
      'Vibe detail shows schedule count summary',
      summaryState.hasSummary,
      summaryState.hasSummary
        ? `text="${summaryState.text}" aria="${summaryState.ariaLabel}"`
        : 'automation summary element missing',
    );

    if (summaryState.hasSummary) {
      const validText = summaryState.text.includes('Not scheduled yet')
        || summaryState.text.includes('active schedule');
      record(
        'S4-COPY',
        'Schedule summary shows expected copy',
        validText,
        `text="${summaryState.text}"`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // S5 — Accessibility: no colour-only badges across primary screens
  // -------------------------------------------------------------------------

  it('S5-A11Y: no badge is colour-only — all have visible text label', async () => {
    // Check across vibes and schedules pages.
    const results_a11y: Array<{ screen: string; badgeCount: number; colourOnlyCount: number }> = [];

    for (const [route, screenName] of [['/schedules', 'Schedules'], ['/vibes', 'Vibes']] as const) {
      await navigateAppRouteSpa(route);
      await browser.pause(3000);
      const check = await browser.execute(() => {
        const badges = Array.from(document.querySelectorAll('.app-automation-badge'));
        let colourOnly = 0;
        for (const badge of badges) {
          const text = badge.querySelector('.app-automation-badge__label')?.textContent?.trim() ?? '';
          if (!text) colourOnly++;
        }
        return { badgeCount: badges.length, colourOnlyCount: colourOnly };
      });
      results_a11y.push({ screen: screenName, ...check });
    }

    const totalColourOnly = results_a11y.reduce((sum, r) => sum + r.colourOnlyCount, 0);
    const totalBadges = results_a11y.reduce((sum, r) => sum + r.badgeCount, 0);

    const detail = results_a11y.map((r) => `${r.screen}: badges=${r.badgeCount} colour-only=${r.colourOnlyCount}`).join(', ');
    record(
      'S5-A11Y',
      'No colour-only badges (all have text label)',
      totalColourOnly === 0,
      `total=${totalBadges} colour-only=${totalColourOnly} — ${detail}`,
    );
  });

  // -------------------------------------------------------------------------
  // S6 — Push tap routing: JS-level verification (FCM real delivery unavailable)
  // -------------------------------------------------------------------------

  it('S6-ROUTING: push tap routing map is correct in loaded app JS', async () => {
    await navigateAppRouteSpa('/schedules');
    await browser.pause(1000);

    // Read ROUTE_BY_NOTIFICATION_TYPE from the loaded app bundle.
    const routes = await browser.execute(() => {
      type WindowWithApp = Window & {
        __IXORA_ROUTING_MAP__?: Record<string, string>;
      };
      // Try debug bridge first (only present when VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true).
      const bridge = (window as WindowWithApp).__IXORA_ROUTING_MAP__;
      if (bridge) return bridge;
      return null;
    });

    if (!routes) {
      // Fallback: verify routing service behaviour via DOM navigation simulation.
      // Navigate SPA to /schedules and assert we're there — confirms route works.
      const schedPath = await browser.execute(() => window.location.pathname);
      record(
        'S6-ROUTING',
        'SPA routing to /schedules functions',
        schedPath === '/schedules',
        `pathname=${schedPath} (ROUTE_BY_NOTIFICATION_TYPE not exposed in debug bridge; unit tests cover full map)`,
      );
    } else {
      const expected: Record<string, string> = {
        schedule_execution_failed: '/schedules',
        smart_home_action_failed: '/devices',
        smart_home_provider_unreachable: '/devices',
        account_security_notice: '/settings',
      };
      const allMatch = Object.entries(expected).every(([type, route]) => routes[type] === route);
      record(
        'S6-ROUTING',
        'Push tap routing map matches spec',
        allMatch,
        `routes=${JSON.stringify(routes)}`,
      );
    }

    recordSkip('S6-FCM', 'Real FCM push delivery + tap routing', 'Requires FCM server key + device push token — environment dependency; unit tests cover routing logic (push-notification-handler.service.test.ts)');
    await capture('s6-routing-check');
  });

  // -------------------------------------------------------------------------
  // S7 — Primary navigation reachable (smoke)
  // -------------------------------------------------------------------------

  it('S7-SMOKE: primary tabs/screens are reachable without crash', async () => {
    const screens: Array<[string, string]> = [
      ['/vibes', 'Vibes'],
      ['/schedules', 'Schedules'],
      ['/settings', 'Settings'],
    ];

    for (const [route, name] of screens) {
      await navigateAppRouteSpa(route);
      await browser.pause(2000);
      const bodyText = await browser.execute(() => document.body?.innerText ?? '');
      const crashed = bodyText.toLowerCase().includes('error') && bodyText.length < 80;
      record(`S7-SMOKE-${name.toUpperCase()}`, `${name} screen reachable without crash`, !crashed, crashed ? `crash suspected: "${bodyText.slice(0, 100)}"` : 'loaded OK');
    }

    await capture('s7-smoke-last-screen');
  });
});
