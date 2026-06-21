import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConnections,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockSync,
} = vi.hoisted(() => ({
  mockGetConnections: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockSync: vi.fn(),
}));

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      getProviderConnections: mockGetConnections,
      getProviderConnection: vi.fn(),
      createProviderConnection: mockCreate,
      updateProviderConnection: mockUpdate,
      deleteProviderConnection: mockDelete,
      syncProviderConnection: mockSync,
    },
    isDeviceOffline: vi.fn(() => false),
  };
});

import { isDeviceOffline, DeviceOfflineError } from '@/services/provider-connection.service';
import { useProviderConnections } from '@/composables/useProviderConnections';

describe('useProviderConnections', () => {
  beforeEach(() => {
    const { connections, selectedConnection } = useProviderConnections();
    connections.value = [];
    selectedConnection.value = null;
    vi.mocked(isDeviceOffline).mockReturnValue(false);
    mockGetConnections.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockSync.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and stores connections', async () => {
    const data = [{ id: 1, name: 'HA', provider: 'home_assistant', status: 'connected' }];
    mockGetConnections.mockResolvedValue(data);

    const { fetchConnections, connections, hasConnection, primaryConnection } =
      useProviderConnections();
    await fetchConnections();

    expect(connections.value).toEqual(data);
    expect(hasConnection.value).toBe(true);
    expect(primaryConnection.value?.id).toBe(1);
  });

  it('keeps in-memory data and surfaces error when list fetch fails offline', async () => {
    const { connections, fetchConnections, listError } = useProviderConnections();
    connections.value = [{ id: 9, name: 'cached' } as never];
    mockGetConnections.mockRejectedValue(new Error('Network down'));

    await fetchConnections();

    expect(connections.value).toEqual([{ id: 9, name: 'cached' }]);
    expect(listError.value).toBe('Network down');
  });

  it('returns null and surfaces error when create is blocked offline', async () => {
    mockCreate.mockRejectedValue(new DeviceOfflineError());

    const { createConnection, error } = useProviderConnections();
    const result = await createConnection({
      name: 'HA',
      provider: 'home_assistant',
      config: { base_url: 'https://ha.example.com' },
      encrypted_credentials: { access_token: 'tok' },
    });

    expect(result).toBeNull();
    expect(mockCreate).toHaveBeenCalled();
    expect(error.value).toBe('Devices can only be changed while online.');
  });

  it('returns null when delete is blocked offline', async () => {
    mockDelete.mockRejectedValue(new DeviceOfflineError());

    const { deleteConnection } = useProviderConnections();
    expect(await deleteConnection(1)).toBe(false);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('returns null when sync is blocked offline', async () => {
    mockSync.mockRejectedValue(new DeviceOfflineError());

    const { syncConnection } = useProviderConnections();
    expect(await syncConnection(1)).toBeNull();
    expect(mockSync).toHaveBeenCalled();
  });

  it('reflects new status locally after a successful sync', async () => {
    const { connections, syncConnection } = useProviderConnections();
    connections.value = [
      { id: 2, name: 'HA', provider: 'home_assistant', status: 'unknown' } as never,
    ];
    mockSync.mockResolvedValue({
      provider_connection_id: 2,
      synced: 4,
      created: 1,
      updated: 3,
      offline: 0,
      status: 'connected',
    });

    const result = await syncConnection(2);
    expect(result?.synced).toBe(4);
    expect(connections.value[0].status).toBe('connected');
  });
});
