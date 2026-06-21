import { ref } from 'vue';
import { coverBundleService } from '@/services/cover-bundle.service';
import type { CoverBundle } from '@/types/cover-bundle';

export function useCoverBundles() {
  const list = ref<CoverBundle[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadList(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await coverBundleService.listCoverBundles();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Something went wrong.';
      list.value = [];
    } finally {
      loading.value = false;
    }
  }

  return {
    list,
    loading,
    error,
    loadList,
  };
}
