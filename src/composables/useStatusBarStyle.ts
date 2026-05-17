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

import { getEffectiveChromeTheme } from '@/theme/theme-state';

const LIGHT_BG = '#ffffff';
/** Full-screen immersive player (hero / OLED edge). */
const DARK_BG = '#000000';
/** Shell chrome in dark UI mode — matches Material baseline used by Ionic dark palette. */
const UI_DARK_SHELL_BG = '#121212';

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

/** Tab/auth/settings surfaces in dark mode — light glyphs on dark gray bar. */
export async function applyUiDarkShellStatusBar(): Promise<void> {
  await safeBar(async () => {
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: UI_DARK_SHELL_BG });
  });
}

/**
 * Reads `meta.statusBarTheme` from the matched route (deepest child wins via Vue Router).
 * When omitted, follows shell theme: light surfaces → dark glyphs (Style.Light); dark shell → light glyphs (Style.Dark).
 */
export async function syncStatusBarWithRoute(to: RouteLocationNormalizedLoaded): Promise<void> {
  const routeTheme = to.meta.statusBarTheme as 'light' | 'dark' | undefined;
  if (routeTheme === 'dark') {
    await applyDarkStatusBar();
    return;
  }
  if (getEffectiveChromeTheme() === 'dark') await applyUiDarkShellStatusBar();
  else await applyLightStatusBar();
}
