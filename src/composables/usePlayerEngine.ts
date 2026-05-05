import { ref } from 'vue';
import { buildVibeExecutionPlan, type VibeExecutionLayer } from '@/services/player-engine.service';
import type { VibeSound } from '@/services/vibe-sound.service';

// Module-level ref so the plan is shared if the composable is used in multiple places
const executionPlan = ref<VibeExecutionLayer[]>([]);

/**
 * Rebuild the execution plan from the current list of configured vibe sounds.
 * Call this whenever the sounds list changes (after attach, update or remove).
 */
function buildPlan(vibeSounds: VibeSound[]): void {
  executionPlan.value = buildVibeExecutionPlan(vibeSounds);
}

/** Reset the plan (e.g. when leaving the vibe context). */
function clearPlan(): void {
  executionPlan.value = [];
}

export function usePlayerEngine() {
  return {
    executionPlan,
    buildPlan,
    clearPlan,
  };
}
