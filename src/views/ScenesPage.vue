<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Scenes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="scenes-content page-shell">
        <AppLoadingState
          v-if="scenesListLoading && !scenes.length"
          class="scenes-state-slot"
          compact
          title="Loading your scenes…"
          description="Fetching your Smart Home scenes."
        />

        <AppErrorState
          v-else-if="scenesListError && !scenes.length"
          class="scenes-state-slot"
          compact
          title="Couldn’t load scenes"
          :description="scenesListError ?? ''"
          retry-label="Retry"
          @retry="fetchScenes"
        />

        <AppEmptyState
          v-else-if="!scenes.length"
          class="scenes-state-slot"
          variant="card"
          :icon="layersOutline"
          title="No scenes yet"
          description="Create a scene to run multiple Smart Home actions together."
          action-label="Create scene"
          @action="goCreate"
        />

        <div v-else class="scenes-list">
          <article
            v-for="scene in scenes"
            :key="scene.id"
            class="app-surface-card scene-card app-card-enter"
          >
            <div class="scene-card-head">
              <div class="scene-card-title-wrap">
                <h2 class="scene-card-name">{{ scene.name }}</h2>
                <p v-if="scene.description" class="scene-card-desc">{{ scene.description }}</p>
              </div>
            </div>

            <div class="scene-card-actions">
              <ion-button fill="outline" size="small" @click="goActions(scene.id)">
                <ion-icon slot="start" :icon="listOutline" />
                Actions
              </ion-button>
              <ion-button fill="outline" size="small" @click="goEdit(scene.id)">
                <ion-icon slot="start" :icon="pencilOutline" />
                Edit
              </ion-button>
              <ion-button fill="outline" size="small" color="danger" @click="handleDelete(scene)">
                <ion-icon slot="start" :icon="trashOutline" />
                Delete
              </ion-button>
              <ion-button
                fill="solid"
                color="primary"
                size="small"
                :disabled="isExecuting(scene.id)"
                @click="handleExecute(scene.id)"
              >
                <ion-spinner v-if="isExecuting(scene.id)" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="playOutline" />
                Execute
              </ion-button>
            </div>
          </article>
        </div>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="scenes-fab">
        <ion-fab-button router-link="/scenes/create" color="primary">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <ion-toast
        :is-open="showToast"
        :message="toastMessage"
        :duration="2800"
        position="bottom"
        @didDismiss="showToast = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  addOutline,
  layersOutline,
  listOutline,
  pencilOutline,
  playOutline,
  trashOutline,
} from 'ionicons/icons';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useScenes } from '@/composables/useScenes';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  DeviceOfflineError,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import { sceneDispatchService } from '@/services/scene-dispatch.service';
import type { Scene } from '@/services/scene.service';

const router = useRouter();
const { scenes, scenesListLoading, scenesListError, fetchScenes, deleteScene } = useScenes();

const offline = ref(isDeviceOffline());
const executingSceneIds = ref<Set<number>>(new Set());
const showToast = ref(false);
const toastMessage = ref('');

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

function blockedOffline(): boolean {
  updateOnlineState();
  if (offline.value) {
    notify(DEVICE_OFFLINE_MUTATION_MESSAGE);
    return true;
  }
  return false;
}

function isExecuting(sceneId: number): boolean {
  return executingSceneIds.value.has(sceneId);
}

function setExecuting(sceneId: number, executing: boolean): void {
  const next = new Set(executingSceneIds.value);
  if (executing) {
    next.add(sceneId);
  } else {
    next.delete(sceneId);
  }
  executingSceneIds.value = next;
}

function formatDispatchMessage(dispatched: number, skipped: number): string {
  const dispatchedLabel = `${dispatched} action${dispatched === 1 ? '' : 's'} dispatched`;
  if (skipped > 0) {
    return `${dispatchedLabel}, ${skipped} skipped.`;
  }
  return `${dispatchedLabel}.`;
}

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});

onIonViewWillEnter(() => {
  updateOnlineState();
  void fetchScenes();
});

function goCreate(): void {
  router.push('/scenes/create');
}

function goEdit(id: number): void {
  router.push(`/scenes/${id}/edit`);
}

function goActions(id: number): void {
  router.push(`/scenes/${id}/actions`);
}

async function handleExecute(sceneId: number): Promise<void> {
  if (blockedOffline() || isExecuting(sceneId)) return;

  setExecuting(sceneId, true);
  try {
    const result = await sceneDispatchService.executeScene(sceneId);
    notify(formatDispatchMessage(result.dispatched, result.skipped));
  } catch (err) {
    if (err instanceof DeviceOfflineError) {
      notify(DEVICE_OFFLINE_MUTATION_MESSAGE);
    } else {
      notify(err instanceof Error ? err.message : 'Could not execute scene.');
    }
  } finally {
    setExecuting(sceneId, false);
  }
}

async function handleDelete(scene: Scene): Promise<void> {
  const alert = await alertController.create({
    header: 'Delete Scene',
    message: `Are you sure you want to delete "${scene.name}"?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => deleteScene(scene.id),
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
.scenes-content {
  padding-top: var(--app-space-2);
  padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
}

.scenes-state-slot {
  margin-top: var(--app-space-6);
}

.scenes-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.scene-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.scene-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.scene-card-title-wrap {
  min-width: 0;
}

.scene-card-name {
  margin: 0;
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-primary);
  line-height: var(--app-line-height-heading-tight);
}

.scene-card-desc {
  margin: var(--app-space-2) 0 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
}

.scene-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}
</style>
