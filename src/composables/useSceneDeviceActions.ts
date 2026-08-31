import { computed, ref } from 'vue';
import {
  sceneDeviceActionService,
  type SceneDeviceAction,
  type SceneDeviceActionPayload,
} from '@/services/scene-device-action.service';
import { isDeviceOffline } from '@/services/provider-connection.service';

/**
 * Module-level reactive state for a scene's device actions, mirroring the
 * `useDevices` / `useSchedules` singleton-ref pattern (no Pinia).
 *
 * Online-only mutations (create / update / delete / reorder) — blocked offline
 * at the service layer (`DeviceOfflineError`). No SQLite mirror in MVP: offline
 * keeps the last in-memory list for the currently loaded scene.
 */
const list = ref<SceneDeviceAction[]>([]);
const loadedSceneId = ref<number | null>(null);

const loading = ref(false);
const error = ref<string | null>(null);

let listFetchGen = 0;

const isOffline = computed(() => isDeviceOffline());
const hasActions = computed(() => list.value.length > 0);

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function clearError(): void {
  error.value = null;
}

function sortByOrder(actions: SceneDeviceAction[]): SceneDeviceAction[] {
  return [...actions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

async function fetchActions(sceneId: number): Promise<void> {
  const gen = ++listFetchGen;
  loading.value = true;
  error.value = null;

  try {
    const data = await sceneDeviceActionService.listSceneDeviceActions(sceneId);
    if (gen !== listFetchGen) return;
    list.value = sortByOrder(data);
    loadedSceneId.value = sceneId;
  } catch (err) {
    if (gen !== listFetchGen) return;
    // Offline (or transient): keep already-loaded in-memory data, surface message.
    handleError(err);
  } finally {
    if (gen === listFetchGen) {
      loading.value = false;
    }
  }
}

async function createAction(
  sceneId: number,
  payload: SceneDeviceActionPayload,
): Promise<SceneDeviceAction | null> {
  loading.value = true;
  error.value = null;
  try {
    const action = await sceneDeviceActionService.createSceneDeviceAction(sceneId, payload);
    list.value = sortByOrder([...list.value, action]);
    return action;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateAction(
  sceneId: number,
  actionId: number,
  payload: SceneDeviceActionPayload,
): Promise<SceneDeviceAction | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await sceneDeviceActionService.updateSceneDeviceAction(sceneId, actionId, payload);
    const index = list.value.findIndex((a) => a.id === actionId);
    if (index !== -1) {
      const next = [...list.value];
      next[index] = updated;
      list.value = sortByOrder(next);
    }
    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteAction(sceneId: number, actionId: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await sceneDeviceActionService.deleteSceneDeviceAction(sceneId, actionId);
    list.value = list.value.filter((a) => a.id !== actionId);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

async function reorderActions(sceneId: number, orderedIds: number[]): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    const reordered = await sceneDeviceActionService.reorderSceneDeviceActions(sceneId, orderedIds);
    list.value = sortByOrder(reordered);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

export function useSceneDeviceActions() {
  return {
    list,
    loadedSceneId,
    loading,
    error,
    isOffline,
    hasActions,
    fetchActions,
    createAction,
    updateAction,
    deleteAction,
    reorderActions,
    clearError,
  };
}
