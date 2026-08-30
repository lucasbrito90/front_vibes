import { ref } from 'vue';
import { sceneService, type Scene, type ScenePayload } from '@/services/scene.service';

const scenes = ref<Scene[]>([]);
const selectedScene = ref<Scene | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** List GET /api/scenes only — avoids list views reacting to mutation or detail-fetch errors. */
const scenesListLoading = ref(false);
const scenesListError = ref<string | null>(null);

let scenesListFetchGen = 0;

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function handleListFetchError(err: unknown): void {
  scenesListError.value = err instanceof Error ? err.message : 'Something went wrong.';
}

async function fetchScenes(): Promise<void> {
  const gen = ++scenesListFetchGen;
  scenesListLoading.value = true;
  scenesListError.value = null;
  try {
    const data = await sceneService.getScenes();
    if (gen !== scenesListFetchGen) {
      return;
    }
    scenes.value = data;
    scenesListError.value = null;
  } catch (err) {
    if (gen !== scenesListFetchGen) {
      return;
    }
    handleListFetchError(err);
  } finally {
    if (gen === scenesListFetchGen) {
      scenesListLoading.value = false;
    }
  }
}

async function fetchScene(id: number): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    selectedScene.value = await sceneService.getScene(id);
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
}

async function createScene(payload: ScenePayload): Promise<Scene | null> {
  loading.value = true;
  error.value = null;
  try {
    const scene = await sceneService.createScene(payload);
    scenes.value.unshift(scene);
    return scene;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateScene(id: number, payload: Partial<ScenePayload>): Promise<Scene | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await sceneService.updateScene(id, payload);
    const index = scenes.value.findIndex((s) => s.id === id);
    if (index !== -1) scenes.value[index] = updated;
    selectedScene.value = updated;
    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteScene(id: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await sceneService.deleteScene(id);
    scenes.value = scenes.value.filter((s) => s.id !== id);
    if (selectedScene.value?.id === id) {
      selectedScene.value = null;
    }
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

export function useScenes() {
  return {
    scenes,
    selectedScene,
    loading,
    error,
    scenesListLoading,
    scenesListError,
    fetchScenes,
    fetchScene,
    createScene,
    updateScene,
    deleteScene,
  };
}
