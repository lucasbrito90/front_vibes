import { browser, driver } from '@wdio/globals';

/** Capacitor Android WebView origin for bundled assets. */
const CAPACITOR_ORIGIN = process.env.CAPACITOR_WEB_ORIGIN ?? 'https://localhost';
const APP_PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter';

function pickAppWebViewContext(contexts: readonly string[]): string | undefined {
  const names = contexts.map(String);
  const preferred = names.find((ctx) => ctx === `WEBVIEW_${APP_PACKAGE}`);
  if (preferred) return preferred;

  const appLike = names.find(
    (ctx) => ctx.includes('WEBVIEW_') && !ctx.includes('WEBVIEW_chrome'),
  );
  if (appLike) return appLike;

  return names.find((ctx) => ctx.includes('WEBVIEW'));
}

export type PlayerNavDiagnostics = {
  pathname: string;
  readyState: string;
  miniPlayerExists: boolean;
  playerPageExists: boolean;
  bodySnippet: string;
  playerStore: PlayerStoreSnapshot | null;
  spaNavMethod?: string;
};

export type PlayerStoreSnapshot = {
  currentVibeId: number | null;
  playbackState: string;
  showMiniPlayer: boolean;
  hasActiveLayers: boolean;
  source: 'native-qa-bridge' | 'debug-panel' | 'unavailable';
};

/**
 * Waits for the Capacitor Chromium WebView and switches context.
 * Ionic/Capacitor apps expose a context named `WEBVIEW_<package>`.
 */
export async function switchToWebView(timeoutMs = 45_000): Promise<string> {
  await browser.waitUntil(
    async () => {
      const contexts = await driver.getContexts();
      return contexts.some((ctx) => String(ctx).includes('WEBVIEW'));
    },
    {
      timeout: timeoutMs,
      timeoutMsg: 'Capacitor WEBVIEW context not found — is the debug APK installed?',
    },
  );

  const contexts = await driver.getContexts();
  const webview = pickAppWebViewContext(contexts);
  if (!webview) {
    throw new Error('WEBVIEW context missing after waitUntil');
  }

  const name = String(webview);
  await driver.switchContext(name);
  return name;
}

/** Full document navigation — use only for cold boot / sign-in. Resets Pinia and WebView JS state. */
export async function navigateAppRouteHard(routePath: string): Promise<void> {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  await browser.url(`${CAPACITOR_ORIGIN}${normalized}`);

  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 20_000, timeoutMsg: `Route did not finish loading: ${normalized}` },
  );
}

/**
 * In-app SPA navigation via Vue Router (or history.pushState fallback).
 * Preserves Pinia player state — required when NativeAudio is still playing.
 */
export async function navigateAppRouteSpa(routePath: string): Promise<string> {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;

  const method = await browser.execute((path) => {
    type RouterLike = { push: (p: string) => unknown };
    type VueApp = { config: { globalProperties: { $router?: RouterLike } } };
    const appEl = document.querySelector('#app') as (HTMLElement & { __vue_app__?: VueApp }) | null;
    const router = appEl?.__vue_app__?.config?.globalProperties?.$router;

    if (router?.push) {
      void router.push(path);
      return 'vue-router-push';
    }

    if (window.location.pathname === path) return 'already-there';
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    return 'history-pushState-popstate';
  }, normalized);

  await browser.waitUntil(
    async () => {
      const pathname = await browser.execute(() => window.location.pathname);
      return pathname === normalized;
    },
    {
      timeout: 20_000,
      timeoutMsg: `SPA route did not update to ${normalized} (method=${method})`,
    },
  );

  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 20_000, timeoutMsg: `SPA route did not settle: ${normalized}` },
  );

  return method;
}

/** @deprecated Prefer {@link navigateAppRouteSpa} once the app is running; hard reload resets player state. */
export async function navigateAppRoute(routePath: string): Promise<void> {
  await navigateAppRouteHard(routePath);
}

export function playerRoute(vibeId: string | number): string {
  return `/vibes/${vibeId}/player`;
}

export async function openPlayerRouteSpa(vibeId: string | number): Promise<void> {
  const path = playerRoute(vibeId);
  const method = await navigateAppRouteSpa(path);
  await browser.$('[data-testid="player-page"]').waitForExist({
    timeout: 45_000,
    timeoutMsg: `Player page missing after SPA nav (${method}) → ${path}`,
  });
}

export async function clickVibeCard(index: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const loading = await browser.$('text=Loading your vibes…').isExisting().catch(() => false);
      const cards = await browser.$$('.vibe-card');
      return !loading && cards.length > index;
    },
    { timeout: 60_000, timeoutMsg: `Vibe card index ${index} not available` },
  );
  const cards = await browser.$$('.vibe-card');
  await cards[index].click();
  await browser.$('[data-testid="player-page"]').waitForExist({ timeout: 20_000 });
}

export async function clickPlayerBack(): Promise<void> {
  await browser.$('button.player-icon-btn[aria-label="Back"]').click();
}

export async function waitForLeftPlayerPage(timeoutMs = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => !(await browser.$('[data-testid="player-page"]').isExisting()),
    { timeout: timeoutMs, timeoutMsg: 'Player page still visible after Back' },
  );

  await browser.waitUntil(
    async () => {
      const pathname = await browser.execute(() => window.location.pathname);
      return pathname === '/vibes' || pathname === '/home' || pathname === '/';
    },
    {
      timeout: timeoutMs,
      timeoutMsg: 'Expected /vibes or /home after leaving player',
    },
  );
}

export async function readPlayerStoreSnapshot(): Promise<PlayerStoreSnapshot> {
  const snapshot = await browser.execute(() => {
    type QaBridge = {
      getPlayerStoreSnapshot?: () => {
        currentVibeId: number | null;
        playbackState: string;
        showMiniPlayer: boolean;
        hasActiveLayers: boolean;
      };
    };
    const qa = (window as unknown as { __IXORA_NATIVE_QA__?: QaBridge }).__IXORA_NATIVE_QA__;
    if (qa?.getPlayerStoreSnapshot) {
      const s = qa.getPlayerStoreSnapshot();
      return { ...s, source: 'native-qa-bridge' as const };
    }

    const readVal = (key: string): string => {
      const keys = document.querySelectorAll('.player-debug-key');
      for (const el of keys) {
        if (el.textContent?.trim() === key) {
          return el.nextElementSibling?.textContent?.trim() ?? '';
        }
      }
      return '';
    };

    const currentVibeIdRaw = readVal('currentVibeId');
    const playbackState = readVal('playbackState');
    const showMiniPlayerRaw = readVal('showMiniPlayer');
    const hasActiveLayersRaw = readVal('hasActiveLayers (store)');

    if (currentVibeIdRaw || playbackState || showMiniPlayerRaw) {
      const parsedId =
        currentVibeIdRaw === 'null' || currentVibeIdRaw === ''
          ? null
          : Number(currentVibeIdRaw);
      return {
        currentVibeId: Number.isFinite(parsedId) ? parsedId : null,
        playbackState: playbackState || 'unknown',
        showMiniPlayer: showMiniPlayerRaw.toLowerCase() === 'true',
        hasActiveLayers: hasActiveLayersRaw.toLowerCase() === 'true',
        source: 'debug-panel' as const,
      };
    }

    return {
      currentVibeId: null,
      playbackState: 'unknown',
      showMiniPlayer: false,
      hasActiveLayers: false,
      source: 'unavailable' as const,
    };
  });

  return snapshot;
}

export async function collectPlayerNavDiagnostics(label: string): Promise<PlayerNavDiagnostics> {
  const diag = await browser.execute(async () => {
    const pathname = window.location.pathname;
    const readyState = document.readyState;
    const miniPlayerExists = !!document.querySelector('.mini-player');
    const playerPageExists = !!document.querySelector('[data-testid="player-page"]');
    const bodySnippet = document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '';
    return { pathname, readyState, miniPlayerExists, playerPageExists, bodySnippet };
  });

  const playerStore = await readPlayerStoreSnapshot().catch(() => null);
  const full: PlayerNavDiagnostics = { ...diag, playerStore };
  console.log(`[webview:${label}] ${JSON.stringify(full)}`);
  return full;
}

export async function waitForMiniPlayer(timeoutMs = 10_000): Promise<WebdriverIO.Element> {
  await collectPlayerNavDiagnostics('before-mini-player-wait');
  const mini = await browser.$('.mini-player');
  try {
    await mini.waitForExist({ timeout: timeoutMs });
  } catch (err: unknown) {
    const after = await collectPlayerNavDiagnostics('mini-player-timeout');
    throw new Error(
      `MiniPlayer not visible after ${timeoutMs}ms — ${JSON.stringify(after)}; original: ${String(err)}`,
    );
  }
  return mini;
}
