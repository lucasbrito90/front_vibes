import { ref } from 'vue';
import { vibeService, type Vibe, type VibePayload } from '@/services/vibe.service';

const vibes = ref<Vibe[]>([]);
const selectedVibe = ref<Vibe | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** List GET /api/vibes only — avoids Home/Vibes reacting to mutation or detail-fetch errors and enables safe concurrent tab mounts. */
const vibesListLoading = ref(false);
const vibesListError = ref<string | null>(null);

let vibesListFetchGen = 0;

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function handleListFetchError(err: unknown): void {
  vibesListError.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchVibes(): Promise<void> {
  const gen = ++vibesListFetchGen;
  vibesListLoading.value = true;
  vibesListError.value = null;
  try {
    const data = await vibeService.getVibes();
    if (gen !== vibesListFetchGen) {
      return;
    }
    vibes.value = data;
    vibesListError.value = null;
  } catch (err) {
    if (gen !== vibesListFetchGen) {
      return;
    }
    handleListFetchError(err);
  } finally {
    if (gen === vibesListFetchGen) {
      vibesListLoading.value = false;
    }
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

/** Drop cached detail when navigating to a different vibe route. */
function clearSelectedVibeIfNot(id: number): void {
  if (selectedVibe.value !== null && selectedVibe.value.id !== id) {
    selectedVibe.value = null;
  }
}

export function useVibes() {
  return {
    vibes,
    selectedVibe,
    loading,
    error,
    vibesListLoading,
    vibesListError,
    fetchVibes,
    fetchVibe,
    createVibe,
    updateVibe,
    deleteVibe,
    hydrateSelectedVibeFromOffline,
    clearSelectedVibeIfNot,
  };
}
