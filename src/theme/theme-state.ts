/**
 * Synchronous snapshot of the shell chrome theme (light/dark surfaces).
 * Used by status-bar sync — player routes still override via route meta.
 */

export type EffectiveTheme = 'light' | 'dark';

let effectiveChrome: EffectiveTheme = 'light';

export function setEffectiveChromeTheme(next: EffectiveTheme): void {
  effectiveChrome = next;
}

export function getEffectiveChromeTheme(): EffectiveTheme {
  return effectiveChrome;
}
