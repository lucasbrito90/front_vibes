/**
 * Native / APK QA diagnostics — opt-in via dev server or `VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true`.
 * Never exposes Firebase secrets; callers may invoke `/api/debug/me` with the user's bearer token client-side only.
 */
import { auth } from '@/services/firebase';
import { getRequiredIdToken, laravelUser } from '@/services/auth.service';
import {
  laravelApiUrl,
  laravelFetch,
  normalizedApiBase,
  resolveLaravelHttpTransport,
  type LaravelHttpResponse,
} from '@/services/laravel-http';
import {
  getNotificationContext,
  getPlaybackSessionSnapshot,
} from '@/services/audio-player.service';
import { usePlayerStore } from '@/stores/player.store';
import { getOfflineManifestRemoteUrlsForVibe } from '@/services/audio-engine/offline-audio-storage';
import { hasOfflineVibeSnapshot } from '@/services/offline-vibe-cache.service';
import { Preferences } from '@capacitor/preferences';

export const NATIVE_QA_GLOBAL_KEY = '__IXORA_NATIVE_QA__' as const;

/** Same gate as exposing `globalThis[NATIVE_QA_GLOBAL_KEY]` (never set in typical production builds). */
export function nativeQaDiagnosticsGloballyAvailable(): boolean {
  return (
    import.meta.env.DEV
    || String(import.meta.env.VITE_ENABLE_NATIVE_QA_DIAGNOSTICS ?? '').toLowerCase() === 'true'
  );
}

/** Called once at bootstrap; no-op unless {@link nativeQaDiagnosticsGloballyAvailable} passes. */
export function installNativeQaDiagnostics(): void {
  if (!nativeQaDiagnosticsGloballyAvailable()) return;

  (globalThis as Record<string, unknown>)[NATIVE_QA_GLOBAL_KEY] = {
    apiBaseUrl: normalizedApiBase(),
    laravelHttpTransport: resolveLaravelHttpTransport(),

    getFirebaseEmail(): string | null {
      return auth.currentUser?.email ?? null;
    },

    getFirebaseUid(): string | null {
      return auth.currentUser?.uid ?? null;
    },

    getLaravelSyncedSnapshot(): typeof laravelUser.value {
      return laravelUser.value;
    },

    /** Pinia player store snapshot for native WebView QA (no secrets). */
    getPlayerStoreSnapshot(): {
      currentVibeId: number | null;
      playbackState: string;
      showMiniPlayer: boolean;
      hasActiveLayers: boolean;
    } {
      const store = usePlayerStore();
      return {
        currentVibeId: store.currentVibeId,
        playbackState: store.playbackState,
        showMiniPlayer: store.showMiniPlayer,
        hasActiveLayers: store.hasActiveLayers,
      };
    },

    /** Audio engine session flags for pause/resume desync investigation. */
    getPlaybackEngineSnapshot(): ReturnType<typeof getPlaybackSessionSnapshot> {
      return getPlaybackSessionSnapshot();
    },

    /** Vibe title/artwork pushed into NativeAudio preload metadata (MediaSession). */
    getNotificationContext(): ReturnType<typeof getNotificationContext> {
      return getNotificationContext();
    },

    /** Combined Pinia + engine snapshot at a single instant (WDIO pause/resume QA). */
    getPlaybackBridgeSnapshot(): {
      store: {
        currentVibeId: number | null;
        playbackState: string;
        showMiniPlayer: boolean;
        hasActiveLayers: boolean;
      };
      engine: ReturnType<typeof getPlaybackSessionSnapshot>;
      ui: {
        miniPlayerMeta: string;
        playerStatusText: string;
        playPauseAriaLabel: string;
      };
    } {
      const store = usePlayerStore();
      const playPauseBtn = document.querySelector(
        '.mini-player-btn:not(.mini-player-btn--stop)',
      ) as HTMLButtonElement | null;
      return {
        store: {
          currentVibeId: store.currentVibeId,
          playbackState: store.playbackState,
          showMiniPlayer: store.showMiniPlayer,
          hasActiveLayers: store.hasActiveLayers,
        },
        engine: getPlaybackSessionSnapshot(),
        ui: {
          miniPlayerMeta: document.querySelector('.mini-player-meta')?.textContent?.trim() ?? '',
          playerStatusText: document.querySelector('.player-status-text')?.textContent?.trim() ?? '',
          playPauseAriaLabel: playPauseBtn?.getAttribute('aria-label') ?? '',
        },
      };
    },

    /**
     * Offline manifest presence via Capacitor Preferences (same path the app uses).
     * Does not expose manifest JSON or remote URLs.
     */
    async probeOfflineStorageForQa(vibeId: number): Promise<{
      audioManifestKeyPresent: boolean;
      vibeManifestKeyPresent: boolean;
      audioEntryCountForVibe: number;
      vibeSnapshotPresent: boolean;
    }> {
      const [audioPref, vibePref, vibeSnapshotPresent, audioUrls] = await Promise.all([
        Preferences.get({ key: 'ixora_offline_audio_manifest_v1' }),
        Preferences.get({ key: 'offline_vibe_manifest_v1' }),
        hasOfflineVibeSnapshot(vibeId),
        getOfflineManifestRemoteUrlsForVibe(vibeId),
      ]);

      return {
        audioManifestKeyPresent: Boolean(audioPref.value),
        vibeManifestKeyPresent: Boolean(vibePref.value),
        audioEntryCountForVibe: Object.keys(audioUrls).length,
        vibeSnapshotPresent,
      };
    },

    /** Calls backend GET /api/debug/me (non-production Laravel only). */
    async fetchBackendDebugMe(): Promise<{ ok: boolean; status: number; body: unknown }> {
      const base = normalizedApiBase();
      if (!base) {
        return { ok: false, status: 0, body: { reason: 'missing_api_base' } };
      }

      let token: string;
      try {
        token = await getRequiredIdToken();
      } catch {
        return { ok: false, status: 0, body: { reason: 'firebase_token_unavailable' } };
      }

      let response: LaravelHttpResponse;
      try {
        response = await laravelFetch(laravelApiUrl('/api/debug/me', base), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      } catch (err: unknown) {
        return { ok: false, status: 0, body: { reason: 'network_error', detail: String(err) } };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      return { ok: response.ok, status: response.status, body };
    },

    /** GET /api/vibes — compares list payload length vs `/api/debug/me` vibes_count (QA only). */
    async fetchVibesIndexForQa(): Promise<{
      ok: boolean;
      status: number;
      count: number | null;
      body: unknown;
    }> {
      const base = normalizedApiBase();
      if (!base) {
        return { ok: false, status: 0, count: null, body: { reason: 'missing_api_base' } };
      }

      let token: string;
      try {
        token = await getRequiredIdToken();
      } catch {
        return { ok: false, status: 0, count: null, body: { reason: 'firebase_token_unavailable' } };
      }

      let response: LaravelHttpResponse;
      try {
        response = await laravelFetch(laravelApiUrl('/api/vibes', base), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      } catch (err: unknown) {
        return { ok: false, status: 0, count: null, body: { reason: 'network_error', detail: String(err) } };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      const data =
        body !== null &&
        typeof body === 'object' &&
        'data' in body &&
        Array.isArray((body as { data: unknown }).data)
          ? (body as { data: unknown[] }).data
          : null;

      return {
        ok: response.ok,
        status: response.status,
        count: data?.length ?? null,
        body,
      };
    },
  };
}
