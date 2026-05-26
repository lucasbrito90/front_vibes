import { browser, driver } from '@wdio/globals';

import { navigateAppRoute } from './webview.js';

function requireEnv(name: 'E2E_USER_EMAIL' | 'E2E_USER_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Export credentials locally before running native lifecycle QA.`,
    );
  }
  return value;
}

/** Email/password sign-in via the Capacitor WebView (Firebase + Laravel sync). */
export async function signInWithEmailPassword(): Promise<void> {
  const email = requireEnv('E2E_USER_EMAIL');
  const password = requireEnv('E2E_USER_PASSWORD');

  await navigateAppRoute('/sign-in-sign-up');
  await browser.$('ion-button.auth-entry-email-button').waitForClickable({ timeout: 15_000 });
  await browser.$('ion-button.auth-entry-email-button').click();

  const emailInput = await browser.$('ion-input input[placeholder="Email"]');
  await emailInput.waitForExist({ timeout: 15_000 });
  await emailInput.setValue(email);

  const passwordInput = await browser.$('ion-input input[placeholder="Password"]');
  await passwordInput.setValue(password);

  try {
    await driver.hideKeyboard();
  } catch {
    /* keyboard may not be visible */
  }

  await browser.execute(() => {
    const btn = document.querySelector('ion-button.auth-submit') as HTMLElement | null;
    btn?.click();
    const form = document.querySelector('form.auth-form') as HTMLFormElement | null;
    form?.requestSubmit();
  });

  await browser.waitUntil(
    async () => {
      const path = await browser.execute(() => window.location.pathname);
      return path === '/home' || path === '/vibes' || path.startsWith('/vibes');
    },
    { timeout: 45_000, timeoutMsg: 'Sign-in did not reach an authenticated route' },
  );
}
