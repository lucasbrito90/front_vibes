import { ref } from 'vue';
import { vibeService, type Vibe, type VibePayload } from '@/services/vibe.service';

const vibes = ref<Vibe[]>([]);
const selectedVibe = ref<Vibe | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchVibes(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    vibes.value = await vibeService.getVibes();
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
}

async function fetchVibe(id: number): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    selectedVibe.value = await vibeService.getVibe(id);
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
}

async function createVibe(payload: VibePayload): Promise<Vibe | null> {
  loading.value = true;
  error.value = null;
  try {
    const vibe = await vibeService.createVibe(payload);
    vibes.value.unshift(vibe);
    return vibe;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateVibe(id: number, payload: Partial<VibePayload>): Promise<Vibe | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await vibeService.updateVibe(id, payload);
    const index = vibes.value.findIndex((v) => v.id === id);
    if (index !== -1) vibes.value[index] = updated;
    selectedVibe.value = updated;
    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteVibe(id: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await vibeService.deleteVibe(id);
    vibes.value = vibes.value.filter((v) => v.id !== id);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

/** Player page: restore GET /vibes/:id detail when API fails but offline snapshot exists. */
function hydrateSelectedVibeFromOffline(vibe: Vibe): void {
  selectedVibe.value = vibe;
}

export function useVibes() {
  return {
    vibes,
    selectedVibe,
    loading,
    error,
    fetchVibes,
    fetchVibe,
    createVibe,
    updateVibe,
    deleteVibe,
    hydrateSelectedVibeFromOffline,
  };
}
