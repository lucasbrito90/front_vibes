/**
 * Maps app routes to Capacitor StatusBar appearance.
 *
 * Capacitor naming:
 * - Style.Light → dark icons/text on the status bar (for bright page backgrounds).
 * - Style.Dark → light icons/text (for dark / immersive screens like the player).
 *
 * On web this module is a no-op.
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

const LIGHT_BG = '#ffffff';
const DARK_BG  = '#000000';

async function safeBar(call: () => Promise<void>): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await call();
  } catch {
    /* StatusBar APIs vary by OS version — never block navigation */
  }
}

/** Bright surfaces (tabs, auth, forms): dark status-bar glyphs. */
export async function applyLightStatusBar(): Promise<void> {
  await safeBar(async () => {
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: LIGHT_BG });
  });
}

/** Dark / immersive UI (full-screen player): light status-bar glyphs. */
export async function applyDarkStatusBar(): Promise<void> {
  await safeBar(async () => {
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: DARK_BG });
  });
}

/**
 * Reads `meta.statusBarTheme` from the matched route (deepest child wins via Vue Router).
 * Defaults to light when omitted.
 */
export async function syncStatusBarWithRoute(to: RouteLocationNormalizedLoaded): Promise<void> {
  const theme = to.meta.statusBarTheme as 'light' | 'dark' | undefined;
  if (theme === 'dark') await applyDarkStatusBar();
  else await applyLightStatusBar();
}
