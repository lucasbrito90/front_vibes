import { computed, ref } from 'vue';
import {
  isDeviceOffline,
  providerConnectionService,
  type ProviderConnection,
  type ProviderConnectionPayload,
  type ProviderConnectionUpdatePayload,
  type ProviderSyncResult,
} from '@/services/provider-connection.service';

/**
 * Module-level reactive state for Smart Home provider connections, mirroring the
 * `useSchedules` / `useVibes` singleton-ref pattern (no Pinia).
 *
 * Online-only: mutations (create / update / delete / sync) are blocked offline
 * at the service layer (DeviceOfflineError). There is NO SQLite mirror for
 * Smart Home in MVP — offline simply shows whatever is already in memory.
 */
const connections = ref<ProviderConnection[]>([]);
const selectedConnection = ref<ProviderConnection | null>(null);

const loading = ref(false);
const error = ref<string | null>(null);

const listLoading = ref(false);
const listError = ref<string | null>(null);

let listFetchGen = 0;

const isOffline = computed(() => isDeviceOffline());

/** True when the user already has at least one provider connection. */
const hasConnection = computed(() => connections.value.length > 0);

/** The first (MVP: only) provider connection, if any. */
const primaryConnection = computed<ProviderConnection | null>(
  () => connections.value[0] ?? null,
);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function clearError(): void {
  error.value = null;
}

async function fetchConnections(): Promise<void> {
  const gen = ++listFetchGen;
  listLoading.value = true;
  listError.value = null;

  try {
    const data = await providerConnectionService.getProviderConnections();
    if (gen !== listFetchGen) return;
    connections.value = data;
    listError.value = null;
  } catch (err) {
    if (gen !== listFetchGen) return;
    // Offline (or transient): keep already-loaded in-memory data, surface message.
    listError.value = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    if (gen === listFetchGen) {
      listLoading.value = false;
    }
  }
}

async function getConnection(id: number): Promise<ProviderConnection | null> {
  loading.value = true;
  error.value = null;
  try {
    const existing = connections.value.find((c) => c.id === id);
    if (isDeviceOffline()) {
      selectedConnection.value = existing ?? null;
      return selectedConnection.value;
    }
    const connection = existing ?? (await providerConnectionService.getProviderConnection(id));
    selectedConnection.value = connection;
    return connection;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function createConnection(
  payload: ProviderConnectionPayload,
): Promise<ProviderConnection | null> {
  loading.value = true;
  error.value = null;
  try {
    const connection = await providerConnectionService.createProviderConnection(payload);
    connections.value.unshift(connection);
    return connection;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateConnection(
  id: number,
  payload: ProviderConnectionUpdatePayload,
): Promise<ProviderConnection | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await providerConnectionService.updateProviderConnection(id, payload);
    const index = connections.value.findIndex((c) => c.id === id);
    if (index !== -1) connections.value[index] = updated;
    selectedConnection.value = updated;
    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteConnection(id: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await providerConnectionService.deleteProviderConnection(id);
    connections.value = connections.value.filter((c) => c.id !== id);
    if (selectedConnection.value?.id === id) selectedConnection.value = null;
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

async function syncConnection(id: number): Promise<ProviderSyncResult | null> {
  loading.value = true;
  error.value = null;
  try {
    const result = await providerConnectionService.syncProviderConnection(id);
    // Reflect the new connection status locally without a refetch.
    const index = connections.value.findIndex((c) => c.id === id);
    if (index !== -1) {
      connections.value[index] = {
        ...connections.value[index],
        status: result.status,
        last_tested_at: new Date().toISOString(),
      };
      if (selectedConnection.value?.id === id) {
        selectedConnection.value = connections.value[index];
      }
    }
    return result;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

export function useProviderConnections() {
  return {
    connections,
    selectedConnection,
    loading,
    error,
    listLoading,
    listError,
    isOffline,
    hasConnection,
    primaryConnection,
    fetchConnections,
    getConnection,
    createConnection,
    updateConnection,
    deleteConnection,
    syncConnection,
    clearError,
  };
}
