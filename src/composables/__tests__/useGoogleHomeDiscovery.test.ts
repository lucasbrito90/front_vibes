import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Per project convention (useAuth.test.ts): mock the SERVICE modules this
// composable consumes, never the raw Capacitor plugin.

const {
  mockGetProviderConnection,
  mockGetProviderTypes,
  mockSyncReportedDevices,
  mockIsGoogleHomeSupported,
  mockRequestPermissions,
  mockListDevices,
  mockMapToIxoraDevice,
} = vi.hoisted(() => ({
  mockGetProviderConnection: vi.fn(),
  mockGetProviderTypes: vi.fn(),
  mockSyncReportedDevices: vi.fn(),
  mockIsGoogleHomeSupported: vi.fn((): boolean => true),
  mockRequestPermissions: vi.fn(),
  mockListDevices: vi.fn(),
  mockMapToIxoraDevice: vi.fn(),
}));

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      ...actual.providerConnectionService,
      getProviderConnection: mockGetProviderConnection,
      getProviderTypes: mockGetProviderTypes,
      syncReportedDevices: mockSyncReportedDevices,
    },
    isDeviceOffline: vi.fn(() => false),
  };
});

vi.mock('@/services/google-home.service', () => ({
  googleHomeService: {
    isGoogleHomeSupported: mockIsGoogleHomeSupported,
    requestPermissions: mockRequestPermissions,
    listDevices: mockListDevices,
    mapToIxoraDevice: mockMapToIxoraDevice,
  },
}));

import { useProviderConnections } from '@/composables/useProviderConnections';
import { useProviderTypes } from '@/composables/useProviderTypes';
import { useGoogleHomeDiscovery } from '@/composables/useGoogleHomeDiscovery';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const googleHomeConnection = {
  id: 42,
  name: 'My Google Home',
  provider: 'google_home',
  config: {},
  status: 'unknown',
  last_tested_at: null,
  created_at: null,
  updated_at: null,
};

const homeAssistantConnection = {
  id: 7,
  name: 'My HA',
  provider: 'home_assistant',
  config: { base_url: 'https://ha.example.test' },
  status: 'connected',
  last_tested_at: null,
  created_at: null,
  updated_at: null,
};

const googleHomeProviderType = {
  slug: 'google_home',
  label: 'Google Home',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

const homeAssistantProviderType = {
  slug: 'home_assistant',
  label: 'Home Assistant',
  config: {},
  credentials: {},
  execution_capabilities: [
    'device_discovery',
    'state_read',
    'interactive_execution',
    'server_side_execution',
    'scheduled_execution',
  ],
};

function rawDevice(id: string, name: string) {
  return { id, name, hasOnOffLight: true, hasOnOffPlug: false, hasDimmableLight: false };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  const { connections } = useProviderConnections();
  const { providerTypes } = useProviderTypes();
  connections.value = [];
  providerTypes.value = [googleHomeProviderType, homeAssistantProviderType];

  mockGetProviderConnection.mockReset();
  mockGetProviderTypes.mockReset().mockResolvedValue([googleHomeProviderType, homeAssistantProviderType]);
  mockSyncReportedDevices.mockReset();
  mockIsGoogleHomeSupported.mockReset().mockReturnValue(true);
  mockRequestPermissions.mockReset();
  mockListDevices.mockReset();
  mockMapToIxoraDevice.mockReset().mockImplementation((raw: { id: string; name: string }) => ({
    provider_device_id: raw.id,
    name: raw.name,
    type: 'lighting',
    capabilities: { can_turn_on: {}, can_turn_off: {}, can_toggle: {} },
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Guards ────────────────────────────────────────────────────────────────────

describe('start() — guards', () => {
  it('sets connection-not-found and never touches the plugin when the connection does not exist', async () => {
    mockGetProviderConnection.mockResolvedValue(undefined);

    const { start, phase } = useGoogleHomeDiscovery();
    await start(999);

    expect(phase.value).toBe('connection-not-found');
    expect(mockIsGoogleHomeSupported).not.toHaveBeenCalled();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('sets capability-unsupported and never touches the plugin when device_discovery is absent', async () => {
    const { connections } = useProviderConnections();
    connections.value = [{ ...homeAssistantConnection, id: 7 }] as never;
    mockGetProviderConnection.mockResolvedValue(undefined);
    const { providerTypes } = useProviderTypes();
    providerTypes.value = [{ ...homeAssistantProviderType, execution_capabilities: ['server_side_execution'] }];

    const { start, phase } = useGoogleHomeDiscovery();
    await start(7);

    expect(phase.value).toBe('capability-unsupported');
    expect(mockIsGoogleHomeSupported).not.toHaveBeenCalled();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('sets platform-unsupported and never requests permission when the platform gate fails', async () => {
    const { connections } = useProviderConnections();
    connections.value = [googleHomeConnection] as never;
    mockIsGoogleHomeSupported.mockReturnValue(false);

    const { start, phase } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('platform-unsupported');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('fetches provider types when not already loaded, then applies the capability guard from the fetched list', async () => {
    const { connections } = useProviderConnections();
    connections.value = [googleHomeConnection] as never;
    const { providerTypes } = useProviderTypes();
    providerTypes.value = [];
    mockGetProviderTypes.mockResolvedValue([googleHomeProviderType]);
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValue([]);

    const { start, phase } = useGoogleHomeDiscovery();
    await start(42);

    expect(mockGetProviderTypes).toHaveBeenCalledOnce();
    expect(phase.value).toBe('discovery-empty');
  });
});

// ── Permission → discovery flow ──────────────────────────────────────────────

describe('start() — permission and discovery', () => {
  beforeEach(() => {
    const { connections } = useProviderConnections();
    connections.value = [googleHomeConnection] as never;
  });

  it('SUCCESS permission leads to discovery and a ready phase with mapped devices', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValue([rawDevice('device@1', 'Kitchen Light')]);

    const { start, phase, devices } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('ready');
    expect(devices.value).toHaveLength(1);
    expect(devices.value[0]).toMatchObject({
      provider_device_id: 'device@1',
      name: 'Kitchen Light',
      selected: false,
    });
  });

  it('CANCELLED permission sets permission-cancelled and never calls listDevices', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'CANCELLED' });

    const { start, phase } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('permission-cancelled');
    expect(mockListDevices).not.toHaveBeenCalled();
  });

  it('ERROR permission sets permission-error with the errorMessage', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'ERROR', errorMessage: 'Client not initialised.' });

    const { start, phase, errorMessage } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('permission-error');
    expect(errorMessage.value).toBe('Client not initialised.');
  });

  it('empty device list sets discovery-empty', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValue([]);

    const { start, phase, devices } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('discovery-empty');
    expect(devices.value).toHaveLength(0);
  });

  it('listDevices throwing sets discovery-error with a message', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockRejectedValue(new Error('SDK unavailable'));

    const { start, phase, errorMessage } = useGoogleHomeDiscovery();
    await start(42);

    expect(phase.value).toBe('discovery-error');
    expect(errorMessage.value).toBe('SDK unavailable');
  });

  it('retryPermission() re-requests permission and can succeed after a cancellation', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ status: 'CANCELLED' });
    const { start, retryPermission, phase } = useGoogleHomeDiscovery();
    await start(42);
    expect(phase.value).toBe('permission-cancelled');

    mockRequestPermissions.mockResolvedValueOnce({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValue([rawDevice('device@2', 'Hallway Light')]);
    await retryPermission();

    expect(phase.value).toBe('ready');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(2);
  });

  it('refreshDiscovery() re-calls listDevices after an empty result', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValueOnce([]);
    const { start, refreshDiscovery, phase, devices } = useGoogleHomeDiscovery();
    await start(42);
    expect(phase.value).toBe('discovery-empty');

    mockListDevices.mockResolvedValueOnce([rawDevice('device@3', 'Office Light')]);
    await refreshDiscovery();

    expect(phase.value).toBe('ready');
    expect(devices.value).toHaveLength(1);
  });
});

// ── Selection + sync ──────────────────────────────────────────────────────────

describe('selection and confirmSync()', () => {
  beforeEach(() => {
    const { connections } = useProviderConnections();
    connections.value = [googleHomeConnection] as never;
  });

  async function discoverTwoDevices() {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });
    mockListDevices.mockResolvedValue([
      rawDevice('device@a', 'Device A'),
      rawDevice('device@b', 'Device B'),
    ]);
    const composable = useGoogleHomeDiscovery();
    await composable.start(42);
    return composable;
  }

  it('toggleSelection flips selected state and updates hasSelection/selectedCount', async () => {
    const { toggleSelection, devices, hasSelection, selectedCount } = await discoverTwoDevices();

    expect(hasSelection.value).toBe(false);
    toggleSelection('device@a');
    expect(devices.value.find((d) => d.provider_device_id === 'device@a')?.selected).toBe(true);
    expect(hasSelection.value).toBe(true);
    expect(selectedCount.value).toBe(1);

    toggleSelection('device@a');
    expect(hasSelection.value).toBe(false);
  });

  it('confirmSync() with zero selected devices is a no-op and does not call the API', async () => {
    const { confirmSync } = await discoverTwoDevices();

    const result = await confirmSync();

    expect(result).toBeNull();
    expect(mockSyncReportedDevices).not.toHaveBeenCalled();
  });

  it('confirmSync() sends only the selected devices and returns the result on success', async () => {
    const { toggleSelection, confirmSync } = await discoverTwoDevices();
    toggleSelection('device@a');
    mockSyncReportedDevices.mockResolvedValue({
      provider_connection_id: 42,
      synced: 1,
      created: 1,
      updated: 0,
      offline: 0,
      status: 'connected',
    });

    const result = await confirmSync();

    expect(result?.synced).toBe(1);
    expect(mockSyncReportedDevices).toHaveBeenCalledWith(
      42,
      [expect.objectContaining({ provider_device_id: 'device@a' })],
    );
  });

  it('confirmSync() error sets sync-error and preserves the current selection', async () => {
    const { toggleSelection, confirmSync, phase, devices, errorMessage } = await discoverTwoDevices();
    toggleSelection('device@a');
    mockSyncReportedDevices.mockRejectedValue(new Error('devices.0.capabilities.can_fly is invalid'));

    const result = await confirmSync();

    expect(result).toBeNull();
    expect(phase.value).toBe('sync-error');
    expect(errorMessage.value).toContain('can_fly');
    // Selection preserved — device@a is still selected after the failure.
    expect(devices.value.find((d) => d.provider_device_id === 'device@a')?.selected).toBe(true);
  });
});
