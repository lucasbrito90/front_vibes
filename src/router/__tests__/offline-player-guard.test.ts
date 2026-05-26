import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isDeviceOffline,
  isOfflinePlayerRoute,
  parsePlayerRouteVibeId,
  shouldSkipLaravelSyncForOfflinePlayer,
} from '@/router/offline-player-guard';

describe('offline-player-guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses player route vibe id', () => {
    expect(parsePlayerRouteVibeId('/vibes/12/player')).toBe(12);
    expect(parsePlayerRouteVibeId('/vibes/12/player/')).toBe(12);
    expect(parsePlayerRouteVibeId('/vibes/abc/player')).toBeNull();
    expect(parsePlayerRouteVibeId('/vibes/12/sounds')).toBeNull();
  });

  it('detects offline player routes only', () => {
    expect(isOfflinePlayerRoute('/vibes/5/player')).toBe(true);
    expect(isOfflinePlayerRoute('/home')).toBe(false);
  });

  it('skips Laravel sync offline on player route with Firebase user', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(shouldSkipLaravelSyncForOfflinePlayer('/vibes/7/player', true)).toBe(true);
  });

  it('does not skip Laravel sync when online', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(shouldSkipLaravelSyncForOfflinePlayer('/vibes/7/player', true)).toBe(false);
  });

  it('does not skip Laravel sync without Firebase user', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(shouldSkipLaravelSyncForOfflinePlayer('/vibes/7/player', false)).toBe(false);
  });

  it('does not skip Laravel sync on non-player routes while offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(shouldSkipLaravelSyncForOfflinePlayer('/vibes', true)).toBe(false);
    expect(shouldSkipLaravelSyncForOfflinePlayer('/home', true)).toBe(false);
  });

  it('reports device offline from navigator.onLine', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isDeviceOffline()).toBe(true);
    vi.stubGlobal('navigator', { onLine: true });
    expect(isDeviceOffline()).toBe(false);
  });
});
