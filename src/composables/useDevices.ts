import { computed, ref } from 'vue';
import {
  deviceService,
  type Device,
  type DevicePayload,
  type DeviceUpdatePayload,
} from '@/services/device.service';
import { isDeviceOffline } from '@/services/provider-connection.service';

/**
 * Module-level reactive state for Smart Home devices, mirroring the
 * `useSchedules` / `useVibes` singleton-ref pattern (no Pinia).
 *
 * Online-only mutations (create / update / delete) — blocked offline at the
 * service layer. No SQLite mirror in MVP: offline keeps the last in-memory list.
 */
const devices = ref<Device[]>([]);
const selectedDevice = ref<Device | null>(null);

const loading = ref(false);
const error = ref<string | null>(null);

const listLoading = ref(false);
const listError = ref<string | null>(null);

let listFetchGen = 0;

const isOffline = computed(() => isDeviceOffline());

const hasDevices = computed(() => devices.value.length > 0);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function clearError(): void {
  error.value = null;
}

async function fetchDevices(): Promise<void> {
  const gen = ++listFetchGen;
  listLoading.value = true;
  listError.value = null;

  try {
    const data = await deviceService.getDevices();
    if (gen !== listFetchGen) return;
    devices.value = data;
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

async function getDevice(id: number): Promise<Device | null> {
  loading.value = true;
  error.value = null;
  try {
    const existing = devices.value.find((d) => d.id === id);
    if (isDeviceOffline()) {
      selectedDevice.value = existing ?? null;
      return selectedDevice.value;
    }
    const device = existing ?? (await deviceService.getDevice(id));
    selectedDevice.value = device;
    return device;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function createDevice(payload: DevicePayload): Promise<Device | null> {
  loading.value = true;
  error.value = null;
  try {
    const device = await deviceService.createDevice(payload);
    devices.value.unshift(device);
    return device;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateDevice(id: number, payload: DeviceUpdatePayload): Promise<Device | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await deviceService.updateDevice(id, payload);
    const index = devices.value.findIndex((d) => d.id === id);
    if (index !== -1) devices.value[index] = updated;
    selectedDevice.value = updated;
    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteDevice(id: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await deviceService.deleteDevice(id);
    devices.value = devices.value.filter((d) => d.id !== id);
    if (selectedDevice.value?.id === id) selectedDevice.value = null;
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

/** Refresh the device list after a provider sync completes. */
async function refreshAfterSync(): Promise<void> {
  await fetchDevices();
}

export function useDevices() {
  return {
    devices,
    selectedDevice,
    loading,
    error,
    listLoading,
    listError,
    isOffline,
    hasDevices,
    fetchDevices,
    getDevice,
    createDevice,
    updateDevice,
    deleteDevice,
    refreshAfterSync,
    clearError,
  };
}
