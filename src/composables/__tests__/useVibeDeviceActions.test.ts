import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockList, mockCreate, mockUpdate, mockDelete, mockReorder } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockReorder: vi.fn(),
}));

vi.mock('@/services/vibe-device-action.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/vibe-device-action.service')>();
  return {
    ...actual,
    vibeDeviceActionService: {
      listVibeDeviceActions: mockList,
      createVibeDeviceAction: mockCreate,
      updateVibeDeviceAction: mockUpdate,
      deleteVibeDeviceAction: mockDelete,
      reorderVibeDeviceActions: mockReorder,
    },
  };
});

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    isDeviceOffline: vi.fn(() => false),
  };
});

import { DeviceOfflineError } from '@/services/provider-connection.service';
import { useVibeDeviceActions } from '@/composables/useVibeDeviceActions';
import type { VibeDeviceAction } from '@/services/vibe-device-action.service';

function action(partial: Partial<VibeDeviceAction> & { id: number }): VibeDeviceAction {
  return {
    vibe_id: 7,
    device_id: 1,
    action_type: 'turn_on',
    parameters: null,
    sort_order: 0,
    delay_seconds: 0,
    created_at: null,
    updated_at: null,
    ...partial,
  };
}

describe('useVibeDeviceActions', () => {
  beforeEach(() => {
    const { list, clearError } = useVibeDeviceActions();
    list.value = [];
    clearError();
    mockList.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockReorder.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and stores actions sorted by sort_order', async () => {
    mockList.mockResolvedValue([
      action({ id: 3, sort_order: 2 }),
      action({ id: 1, sort_order: 0 }),
      action({ id: 2, sort_order: 1 }),
    ]);

    const { fetchActions, list, hasActions } = useVibeDeviceActions();
    await fetchActions(7);

    expect(list.value.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(hasActions.value).toBe(true);
  });

  it('keeps in-memory list and surfaces error when fetch fails offline', async () => {
    const { list, fetchActions, error } = useVibeDeviceActions();
    list.value = [action({ id: 5 })];
    mockList.mockRejectedValue(new Error('Network down'));

    await fetchActions(7);

    expect(list.value.map((a) => a.id)).toEqual([5]);
    expect(error.value).toBe('Network down');
  });

  it('appends a created action and keeps order', async () => {
    const { list, createAction } = useVibeDeviceActions();
    list.value = [action({ id: 1, sort_order: 0 })];
    mockCreate.mockResolvedValue(action({ id: 2, sort_order: 1 }));

    const created = await createAction(7, { device_id: 1, action_type: 'toggle' });

    expect(created?.id).toBe(2);
    expect(list.value.map((a) => a.id)).toEqual([1, 2]);
  });

  it('replaces an updated action in place', async () => {
    const { list, updateAction } = useVibeDeviceActions();
    list.value = [action({ id: 1, action_type: 'turn_on' })];
    mockUpdate.mockResolvedValue(action({ id: 1, action_type: 'turn_off' }));

    await updateAction(7, 1, { action_type: 'turn_off' });

    expect(list.value[0].action_type).toBe('turn_off');
  });

  it('removes a deleted action from the list', async () => {
    const { list, deleteAction } = useVibeDeviceActions();
    list.value = [action({ id: 1 }), action({ id: 2 })];
    mockDelete.mockResolvedValue(undefined);

    const ok = await deleteAction(7, 1);

    expect(ok).toBe(true);
    expect(list.value.map((a) => a.id)).toEqual([2]);
  });

  it('reorders using the backend response', async () => {
    const { list, reorderActions } = useVibeDeviceActions();
    list.value = [action({ id: 1, sort_order: 0 }), action({ id: 2, sort_order: 1 })];
    mockReorder.mockResolvedValue([
      action({ id: 2, sort_order: 0 }),
      action({ id: 1, sort_order: 1 }),
    ]);

    const ok = await reorderActions(7, [2, 1]);

    expect(ok).toBe(true);
    expect(mockReorder).toHaveBeenCalledWith(7, [2, 1]);
    expect(list.value.map((a) => a.id)).toEqual([2, 1]);
  });

  it('returns null and surfaces message when create is blocked offline', async () => {
    mockCreate.mockRejectedValue(new DeviceOfflineError());

    const { createAction, error } = useVibeDeviceActions();
    const result = await createAction(7, { device_id: 1, action_type: 'turn_on' });

    expect(result).toBeNull();
    expect(error.value).toBe('Devices can only be changed while online.');
  });

  it('returns false when delete is blocked offline', async () => {
    mockDelete.mockRejectedValue(new DeviceOfflineError());

    const { deleteAction } = useVibeDeviceActions();
    expect(await deleteAction(7, 1)).toBe(false);
  });

  it('returns false when reorder is blocked offline', async () => {
    mockReorder.mockRejectedValue(new DeviceOfflineError());

    const { reorderActions } = useVibeDeviceActions();
    expect(await reorderActions(7, [1, 2])).toBe(false);
  });
});
