import { computed, ref } from 'vue';
import { useProviderConnections } from '@/composables/useProviderConnections';
import { useProviderTypes } from '@/composables/useProviderTypes';
import { googleHomeService, type IxoraMappedDevice } from '@/services/google-home.service';
import {
  providerConnectionService,
  type ProviderSyncResult,
  type ReportedDevicePayload,
} from '@/services/provider-connection.service';

/**
 * useGoogleHomeDiscovery.ts
 *
 * Drives the connect → consent → discover → select → sync flow behind
 * GoogleHomeDeviceDiscoveryPage.vue (ADR-036 §7 mobile/backend boundary —
 * the mobile runtime discovers devices via the Home SDK and reports them;
 * back_vibes never pulls Google Home).
 *
 * The heavy logic lives here (not in the .vue file) so it can be unit
 * tested by mocking `google-home.service` wholesale — this project has no
 * precedent for mounting a native-plugin-consuming page/composable against
 * a mocked Capacitor plugin directly (see useAuth.test.ts for the pattern
 * this mirrors: mock the SERVICE, never the raw plugin).
 *
 * Stateless w.r.t. the Google device id: `devices` below is component-local
 * (module-level ref, matching this project's singleton-composable pattern,
 * but reset on every `start()` call) and is never persisted outside memory.
 */

export type GoogleHomeDiscoveryPhase =
  | 'loading'
  | 'connection-not-found'
  | 'capability-unsupported'
  | 'platform-unsupported'
  | 'requesting-permission'
  | 'permission-cancelled'
  | 'permission-error'
  | 'discovering'
  | 'discovery-error'
  | 'discovery-empty'
  | 'ready'
  | 'syncing'
  | 'sync-error';

export interface DiscoveredDevice extends IxoraMappedDevice {
  selected: boolean;
}

const phase = ref<GoogleHomeDiscoveryPhase>('loading');
const errorMessage = ref<string | null>(null);
const devices = ref<DiscoveredDevice[]>([]);
const activeConnectionId = ref<number | null>(null);

const selectedCount = computed(() => devices.value.filter((d) => d.selected).length);
const hasSelection = computed(() => selectedCount.value > 0);

function resetState(): void {
  phase.value = 'loading';
  errorMessage.value = null;
  devices.value = [];
}

/** Calls listDevices() and updates phase/devices — assumes the caller already holds permission. */
async function runDiscovery(): Promise<void> {
  phase.value = 'discovering';
  errorMessage.value = null;

  try {
    const raw = await googleHomeService.listDevices();

    if (raw.length === 0) {
      devices.value = [];
      phase.value = 'discovery-empty';
      return;
    }

    devices.value = raw.map((device) => ({
      ...googleHomeService.mapToIxoraDevice(device),
      selected: false,
    }));
    phase.value = 'ready';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not discover devices.';
    phase.value = 'discovery-error';
  }
}

/** Requests permission, then discovers on SUCCESS. Never called before the guards in start() pass. */
async function requestPermissionAndDiscover(): Promise<void> {
  phase.value = 'requesting-permission';
  errorMessage.value = null;

  try {
    const result = await googleHomeService.requestPermissions();

    if (result.status === 'SUCCESS') {
      await runDiscovery();
    } else if (result.status === 'CANCELLED') {
      phase.value = 'permission-cancelled';
    } else {
      errorMessage.value = result.errorMessage ?? 'Could not get permission to access Google Home.';
      phase.value = 'permission-error';
    }
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Could not get permission to access Google Home.';
    phase.value = 'permission-error';
  }
}

/**
 * Entry point for the discovery page. Runs the mandatory guards (in this
 * exact order) BEFORE ever touching the native plugin:
 *   1. connection exists
 *   2. connection's provider declares 'device_discovery' (ADR-036 Decision 2)
 *   3. platform gate (Android native)
 * Only after all three pass does it request permission and discover.
 */
async function start(connectionId: number): Promise<void> {
  activeConnectionId.value = connectionId;
  resetState();

  const { getConnection } = useProviderConnections();
  const { providerTypes, fetchProviderTypes, findProviderType } = useProviderTypes();

  const connection = await getConnection(connectionId);
  if (!connection) {
    phase.value = 'connection-not-found';
    return;
  }

  if (providerTypes.value.length === 0) {
    await fetchProviderTypes();
  }

  const providerType = findProviderType(connection.provider);
  const capabilities = providerType?.execution_capabilities ?? [];

  if (!capabilities.includes('device_discovery')) {
    phase.value = 'capability-unsupported';
    return;
  }

  if (!googleHomeService.isGoogleHomeSupported()) {
    phase.value = 'platform-unsupported';
    return;
  }

  await requestPermissionAndDiscover();
}

function toggleSelection(providerDeviceId: string): void {
  const device = devices.value.find((d) => d.provider_device_id === providerDeviceId);
  if (device) {
    device.selected = !device.selected;
  }
}

/**
 * Syncs only the selected devices. Callers must gate on `hasSelection` before
 * invoking this (the backend's `devices` rule is `min:1` — never call with
 * zero devices). Returns null on failure; `errorMessage`/`phase` are updated
 * for the UI, and the current selection is preserved either way.
 */
async function confirmSync(): Promise<ProviderSyncResult | null> {
  if (activeConnectionId.value === null || !hasSelection.value) {
    return null;
  }

  phase.value = 'syncing';
  errorMessage.value = null;

  const payload: ReportedDevicePayload[] = devices.value
    .filter((d) => d.selected)
    .map((d) => ({
      provider_device_id: d.provider_device_id,
      name: d.name,
      type: d.type,
      capabilities: d.capabilities,
    }));

  try {
    const result = await providerConnectionService.syncReportedDevices(
      activeConnectionId.value,
      payload,
    );
    return result;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not sync devices.';
    phase.value = 'sync-error';
    return null;
  } finally {
    if (phase.value === 'syncing') {
      phase.value = 'ready';
    }
  }
}

export function useGoogleHomeDiscovery() {
  return {
    phase,
    errorMessage,
    devices,
    selectedCount,
    hasSelection,
    start,
    retryPermission: requestPermissionAndDiscover,
    refreshDiscovery: runDiscovery,
    toggleSelection,
    confirmSync,
  };
}
