import { browser, driver } from '@wdio/globals';

/** Capacitor Android WebView origin for bundled assets. */
const CAPACITOR_ORIGIN = process.env.CAPACITOR_WEB_ORIGIN ?? 'https://localhost';

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
  const webview = contexts.find((ctx) => String(ctx).includes('WEBVIEW'));
  if (!webview) {
    throw new Error('WEBVIEW context missing after waitUntil');
  }

  const name = String(webview);
  await driver.switchContext(name);
  return name;
}

/** Navigate inside the WebView using the Vue router history base (Capacitor origin). */
export async function navigateAppRoute(routePath: string): Promise<void> {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  await browser.url(`${CAPACITOR_ORIGIN}${normalized}`);

  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 20_000, timeoutMsg: `Route did not finish loading: ${normalized}` },
  );
}

export function playerRoute(vibeId: string | number): string {
  return `/vibes/${vibeId}/player`;
}
