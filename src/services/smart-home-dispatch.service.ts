import { getRequiredIdToken } from './auth.service';
import { isDeviceOffline } from './provider-connection.service';
import { laravelApiUrl, laravelFetch } from './laravel-http';
import { createLogger } from '@/utils/player-debug';

/**
 * Smart Home Phase 8 — fire-and-forget dispatch client.
 *
 * Notifies the Laravel backend that a vibe play was started so it can
 * enqueue SmartHomeActionJob for each attached device action.
 *
 * Hard boundaries:
 * - Fire-and-forget: failure MUST NOT block audio playback.
 * - Offline: silently skipped (no error thrown, no retry).
 * - No retry queue.
 * - No UI update — this is a side-effect, not user-visible state.
 * - Never calls Home Assistant or any provider directly.
 */

const log = createLogger('SmartHomeDispatch');

export interface SmartHomeDispatchResult {
  vibe_id: number;
  dispatched: number;
  skipped: number;
  action_ids: number[];
}

/**
 * Fire-and-forget: dispatches Smart Home device actions for the given vibe.
 *
 * Returns the summary DTO if successful, or `null` on any failure
 * (offline, network error, 4xx/5xx). Never throws.
 */
export async function dispatchVibeSmartHomeActions(
  vibeId: number,
): Promise<SmartHomeDispatchResult | null> {
  if (isDeviceOffline()) {
    log.debug('dispatchVibeSmartHomeActions: offline — skipping silently.', { vibeId });
    return null;
  }

  try {
    const token = await getRequiredIdToken();
    const url = laravelApiUrl(`/api/vibes/${vibeId}/smart-home/dispatch`);

    const response = await laravelFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      log.debug('dispatchVibeSmartHomeActions: non-ok response — ignoring.', {
        vibeId,
        status: response.status,
      });
      return null;
    }

    const json = (await response.json()) as { data: SmartHomeDispatchResult };

    log.debug('dispatchVibeSmartHomeActions: dispatched.', {
      vibeId,
      dispatched: json.data.dispatched,
      skipped: json.data.skipped,
    });

    return json.data;
  } catch (err) {
    log.debug('dispatchVibeSmartHomeActions: error — ignoring.', { vibeId, err });
    return null;
  }
}
