import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDevices, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockGetDevices: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/services/device.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/device.service')>();
  return {
    ...actual,
    deviceService: {
      getDevices: mockGetDevices,
      getDevice: vi.fn(),
      createDevice: mockCreate,
      updateDevice: mockUpdate,
      deleteDevice: mockDelete,
    },
  };
});

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    isDeviceOffline: vi.fn(() => false),
  };
});

import { isDeviceOffline, DeviceOfflineError } from '@/services/provider-connection.service';
import { useDevices } from '@/composables/useDevices';

describe('useDevices', () => {
  beforeEach(() => {
    const { devices, selectedDevice } = useDevices();
    devices.value = [];
    selectedDevice.value = null;
    vi.mocked(isDeviceOffline).mockReturnValue(false);
    mockGetDevices.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and stores devices', async () => {
    const data = [{ id: 1, name: 'Lamp', status: 'online' }];
    mockGetDevices.mockResolvedValue(data);

    const { fetchDevices, devices, hasDevices } = useDevices();
    await fetchDevices();

    expect(devices.value).toEqual(data);
    expect(hasDevices.value).toBe(true);
  });

  it('keeps in-memory devices and surfaces error when list fetch fails offline', async () => {
    const { devices, fetchDevices, listError } = useDevices();
    devices.value = [{ id: 5, name: 'cached' } as never];
    mockGetDevices.mockRejectedValue(new Error('Network down'));

    await fetchDevices();

    expect(devices.value).toEqual([{ id: 5, name: 'cached' }]);
    expect(listError.value).toBe('Network down');
  });

  it('returns null when update is blocked offline', async () => {
    mockUpdate.mockRejectedValue(new DeviceOfflineError());

    const { updateDevice, error } = useDevices();
    const result = await updateDevice(1, { name: 'x' });

    expect(result).toBeNull();
    expect(mockUpdate).toHaveBeenCalled();
    expect(error.value).toBe('Devices can only be changed while online.');
  });

  it('returns false when delete is blocked offline', async () => {
    mockDelete.mockRejectedValue(new DeviceOfflineError());

    const { deleteDevice } = useDevices();
    expect(await deleteDevice(1)).toBe(false);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('refreshAfterSync re-fetches the device list', async () => {
    mockGetDevices.mockResolvedValue([{ id: 2, name: 'Synced' }]);

    const { refreshAfterSync, devices } = useDevices();
    await refreshAfterSync();

    expect(mockGetDevices).toHaveBeenCalled();
    expect(devices.value).toEqual([{ id: 2, name: 'Synced' }]);
  });
});
