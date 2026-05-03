import { ref } from 'vue';
import {
  vibeSoundService,
  type AttachSoundPayload,
  type UpdateVibeSoundPayload,
  type VibeSound,
} from '@/services/vibe-sound.service';

const vibeSounds = ref<VibeSound[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchVibeSounds(vibeId: number): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    vibeSounds.value = await vibeSoundService.getVibeSounds(vibeId);
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
}

async function attachSound(vibeId: number, payload: AttachSoundPayload): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    const attached = await vibeSoundService.attachSoundToVibe(vibeId, payload);
    vibeSounds.value.push(attached);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

async function updateVibeSound(
  vibeId: number,
  soundId: number,
  payload: UpdateVibeSoundPayload,
): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await vibeSoundService.updateVibeSound(vibeId, soundId, payload);
    const idx = vibeSounds.value.findIndex((s) => s.id === soundId);
    if (idx !== -1) vibeSounds.value[idx] = updated;
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

async function removeVibeSound(vibeId: number, soundId: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await vibeSoundService.removeSoundFromVibe(vibeId, soundId);
    vibeSounds.value = vibeSounds.value.filter((s) => s.id !== soundId);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

export function useVibeSounds() {
  return {
    vibeSounds,
    loading,
    error,
    fetchVibeSounds,
    attachSound,
    updateVibeSound,
    removeVibeSound,
  };
}
