/**
 * Offline player route guard helpers.
 * Allows authenticated users with a local Firebase session to open /vibes/:id/player
 * without Laravel sync when the device is offline. Playback still requires a downloaded snapshot.
 */

import { isVibeDownloaded } from '@/services/offline-downloads.service';

const PLAYER_ROUTE_PATTERN = /^\/vibes\/(\d+)\/player\/?$/;

export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** Returns vibe id when `path` is `/vibes/:id/player`, otherwise null. */
export function parsePlayerRouteVibeId(path: string): number | null {
  const match = path.match(PLAYER_ROUTE_PATTERN);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function isOfflinePlayerRoute(path: string): boolean {
  return parsePlayerRouteVibeId(path) !== null;
}

/**
 * Skip Laravel `/api/auth/sync` on the player route when offline with a Firebase session.
 * VibePlayerPage hydrates from `offline_vibe_manifest_v1` or shows a friendly unavailable state.
 */
export function shouldSkipLaravelSyncForOfflinePlayer(path: string, hasFirebaseUser: boolean): boolean {
  if (!hasFirebaseUser || !isDeviceOffline()) return false;
  return isOfflinePlayerRoute(path);
}

/** Whether this vibe has a persisted offline metadata snapshot (download completed successfully). */
export async function isDownloadedVibeForOfflineAccess(vibeId: number): Promise<boolean> {
  if (vibeId <= 0) return false;
  return isVibeDownloaded(vibeId);
}
