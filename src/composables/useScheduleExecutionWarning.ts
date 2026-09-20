import { ref } from 'vue';
import { useProviderTypes } from '@/composables/useProviderTypes';
import { useVibes } from '@/composables/useVibes';
import { sceneDeviceActionService } from '@/services/scene-device-action.service';
import { isDeviceOffline } from '@/services/schedule.service';

/**
 * useScheduleExecutionWarning.ts
 *
 * ADR-036 Decision 5 — before a user confirms a Schedule, warn them when the
 * selected Vibe has Smart Home device actions whose provider does not
 * declare `scheduled_execution` (today, in practice, Google Home devices).
 * This mirrors — on the client, ahead of time — the same decision the
 * backend already makes at dispatch time (P08:
 * VibeSmartHomeDispatchService skips these actions and records
 * `skipped_unsupported_execution` / the `skipped_unsupported` outcome).
 * The warning is informative only: the schedule can still be saved with it
 * showing — this is a known, accepted limitation (ADR-036), not an error.
 *
 * Zero provider-slug comparisons. The only source of truth is
 * `ProviderType.execution_capabilities` (P03/P12), resolved via
 * `useProviderTypes().findProviderType()`. A provider with no descriptor at
 * all (unknown slug) is treated as NOT schedulable — the same safe default
 * the backend's `skipped_unsupported` outcome encodes.
 *
 * Kept separate from ScheduleFormPage.vue — mirrors the
 * useGoogleHomeDiscovery.ts precedent of isolating a derivation behind a
 * composable so it stays unit-testable by mocking the services it calls,
 * without mounting the page.
 */

const hasUnschedulableActions = ref(false);

let evaluationGen = 0;

/**
 * Re-derives the warning for the given vibe id. Safe to call on every vibe
 * selection change — each call invalidates any in-flight previous
 * evaluation via a generation counter, so a slow response for a
 * since-abandoned vibe can never overwrite the state for the vibe the user
 * has since selected (no race).
 *
 * Never throws: any failure resolving provider types or scene actions is
 * treated as "no warning" — this signal is advisory only and must never
 * block or error out the schedule form.
 */
async function evaluate(vibeId: number | null): Promise<void> {
  const gen = ++evaluationGen;
  hasUnschedulableActions.value = false;

  if (vibeId === null) {
    return;
  }

  // Advisory-only feature: never fire a request while offline. The form's
  // own offline banner already communicates the broader limitation.
  if (isDeviceOffline()) {
    return;
  }

  const { vibes } = useVibes();
  const vibe = vibes.value.find((v) => v.id === vibeId);
  const sceneId = vibe?.scene_id;

  // No scene (or vibe not resolved yet) → no device actions → nothing to warn about.
  if (sceneId === null || sceneId === undefined) {
    return;
  }

  try {
    const {
      providerTypes,
      error: providerTypesError,
      fetchProviderTypes,
      findProviderType,
    } = useProviderTypes();
    if (providerTypes.value.length === 0) {
      await fetchProviderTypes();
      if (gen !== evaluationGen) return;
      // fetchProviderTypes() never throws — it records failures on its own
      // `error` ref instead. Without a capabilities list every provider
      // would look unschedulable, which is wrong: surface this as a
      // failure so the warning fails silent instead of false-positiving.
      if (providerTypesError.value) {
        throw new Error(providerTypesError.value);
      }
    }

    const actions = await sceneDeviceActionService.listSceneDeviceActions(sceneId);
    if (gen !== evaluationGen) return;

    const unschedulable = actions.some((action) => {
      const device = action.device;
      if (!device) return false; // action without device info — ignore, not incompatible.

      const capabilities = findProviderType(device.provider)?.execution_capabilities ?? [];
      return !capabilities.includes('scheduled_execution');
    });

    if (gen !== evaluationGen) return;
    hasUnschedulableActions.value = unschedulable;
  } catch (err) {
    // Advisory-only: fail silently for the UI (no warning, no form error),
    // but don't swallow the failure without a trace.
    if (gen === evaluationGen) {
      hasUnschedulableActions.value = false;
    }
    console.warn('[useScheduleExecutionWarning] evaluation failed — warning skipped:', err);
  }
}

export function useScheduleExecutionWarning() {
  return {
    hasUnschedulableActions,
    evaluate,
  };
}
