import { computed, ref } from 'vue';
import { Preferences } from '@capacitor/preferences';

import router from '@/router';
import { syncStatusBarWithRoute } from '@/composables/useStatusBarStyle';
import { setEffectiveChromeTheme, type EffectiveTheme } from '@/theme/theme-state';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ixora_theme_mode_v1';

/** User preference: System follows OS; Light/Dark pin the palette. */
export const themeMode = ref<ThemeMode>('system');

/** Bumped when OS scheme changes so `effectiveTheme` recomputes while mode is System. */
const systemDarkSnapshot = ref(false);

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolved palette used for `ion-palette-dark` and shell chrome. */
export const effectiveTheme = computed<EffectiveTheme>(() => {
  const m = themeMode.value;
  if (m === 'light') return 'light';
  if (m === 'dark') return 'dark';
  void systemDarkSnapshot.value;
  return readSystemPrefersDark() ? 'dark' : 'light';
});

let mediaQuery: MediaQueryList | null = null;
let onMediaChange: (() => void) | null = null;

function detachSystemListener(): void {
  if (mediaQuery && onMediaChange) {
    mediaQuery.removeEventListener('change', onMediaChange);
  }
  mediaQuery = null;
  onMediaChange = null;
}

function attachSystemListener(): void {
  detachSystemListener();
  if (typeof window === 'undefined') return;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  onMediaChange = () => {
    systemDarkSnapshot.value = readSystemPrefersDark();
    paintChromeAndStatusBar();
  };
  mediaQuery.addEventListener('change', onMediaChange);
}

/** Uses current `themeMode` + optional live system query — not the computed cache. */
function resolveEffectiveSync(): EffectiveTheme {
  const m = themeMode.value;
  if (m === 'light') return 'light';
  if (m === 'dark') return 'dark';
  return readSystemPrefersDark() ? 'dark' : 'light';
}

function paintChromeAndStatusBar(): void {
  const eff = resolveEffectiveSync();
  document.documentElement.classList.toggle('ion-palette-dark', eff === 'dark');
  setEffectiveChromeTheme(eff);
  void syncStatusBarWithRoute(router.currentRoute.value);
}

async function loadStoredMode(): Promise<ThemeMode> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value === 'system' || value === 'light' || value === 'dark') return value;
  } catch {
    /* Preferences unavailable — try localStorage */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'system' || raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

async function persistMode(mode: ThemeMode): Promise<void> {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: mode });
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Call once before mount so the first paint matches stored / system preference. */
export async function initThemeMode(): Promise<void> {
  themeMode.value = await loadStoredMode();
  systemDarkSnapshot.value = readSystemPrefersDark();
  detachSystemListener();
  if (themeMode.value === 'system') attachSystemListener();
  paintChromeAndStatusBar();
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  themeMode.value = mode;
  await persistMode(mode);
  detachSystemListener();
  systemDarkSnapshot.value = readSystemPrefersDark();
  if (mode === 'system') attachSystemListener();
  paintChromeAndStatusBar();
}

export function useThemeMode() {
  return {
    themeMode,
    effectiveTheme,
    setThemeMode,
    initThemeMode,
  };
}
