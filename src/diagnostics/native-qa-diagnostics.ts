/**
 * Native / APK QA diagnostics — opt-in via dev server or `VITE_ENABLE_NATIVE_QA_DIAGNOSTICS=true`.
 * Never exposes Firebase secrets; callers may invoke `/api/debug/me` with the user's bearer token client-side only.
 */
import { auth } from '@/services/firebase';
import { getRequiredIdToken, laravelUser } from '@/services/auth.service';

export const NATIVE_QA_GLOBAL_KEY = '__IXORA_NATIVE_QA__' as const;

/** Same gate as exposing `globalThis[NATIVE_QA_GLOBAL_KEY]` (never set in typical production builds). */
export function nativeQaDiagnosticsGloballyAvailable(): boolean {
  return (
    import.meta.env.DEV
    || String(import.meta.env.VITE_ENABLE_NATIVE_QA_DIAGNOSTICS ?? '').toLowerCase() === 'true'
  );
}

function normalizedApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
}

/** Called once at bootstrap; no-op unless {@link nativeQaDiagnosticsGloballyAvailable} passes. */
export function installNativeQaDiagnostics(): void {
  if (!nativeQaDiagnosticsGloballyAvailable()) return;

  (globalThis as Record<string, unknown>)[NATIVE_QA_GLOBAL_KEY] = {
    apiBaseUrl: normalizedApiBase(),

    getFirebaseEmail(): string | null {
      return auth.currentUser?.email ?? null;
    },

    getFirebaseUid(): string | null {
      return auth.currentUser?.uid ?? null;
    },

    getLaravelSyncedSnapshot(): typeof laravelUser.value {
      return laravelUser.value;
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

      let response: Response;
      try {
        response = await fetch(`${base}/api/debug/me`, {
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

      let response: Response;
      try {
        response = await fetch(`${base}/api/vibes`, {
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
