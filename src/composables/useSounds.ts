import { ref } from 'vue';
import { soundService, type Sound } from '@/services/sound.service';

const sounds = ref<Sound[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchSounds(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    sounds.value = await soundService.getSounds();
    console.log('[useSounds] fetched:', sounds.value.length, sounds.value);
  } catch (err) {
    console.error('[useSounds] error:', err);
    handleError(err);
  } finally {
    loading.value = false;
  }
}

export function useSounds() {
  return { sounds, loading, error, fetchSounds };
}
