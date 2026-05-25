import { ref } from 'vue';
import { presetVibeService } from '@/services/preset-vibe.service';
import type { PresetVibe } from '@/types/preset-vibe';

const presets = ref<PresetVibe[]>([]);
const selected = ref<PresetVibe | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchPresets(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    presets.value = await presetVibeService.listPresetVibes();
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
}

async function fetchPreset(id: number): Promise<void> {
  loading.value = true;
  error.value = null;
  selected.value = null;
  try {
    selected.value = await presetVibeService.getPresetVibe(id);
  } catch (err) {
    handleError(err);
    selected.value = null;
  } finally {
    loading.value = false;
  }
}

export function usePresetVibes() {
  return {
    presets,
    selected,
    loading,
    error,
    fetchPresets,
    fetchPreset,
  };
}
