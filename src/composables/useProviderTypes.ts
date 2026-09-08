import { ref } from 'vue';
import {
  providerConnectionService,
  type ProviderType,
} from '@/services/provider-connection.service';

/**
 * Module-level reactive state for provider types, mirroring the
 * useProviderConnections singleton-ref pattern (no Pinia).
 *
 * Fetched once from GET /api/provider-types (T25). The list is stable
 * within a session — provider types are defined by the backend and change
 * only on deployments.
 */
const providerTypes = ref<ProviderType[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchProviderTypes(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    providerTypes.value = await providerConnectionService.getProviderTypes();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    loading.value = false;
  }
}

function findProviderType(slug: string): ProviderType | undefined {
  return providerTypes.value.find((p) => p.slug === slug);
}

export function useProviderTypes() {
  return {
    providerTypes,
    loading,
    error,
    fetchProviderTypes,
    findProviderType,
  };
}
