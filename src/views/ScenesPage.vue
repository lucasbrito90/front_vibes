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
import type { SceneExecutionByProvider } from '@/services/scene-dispatch.service';
import { googleHomeExecutionService } from '@/services/google-home-execution.service';
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

/**
 * ADR-036 Decision 7 — a device-side action (today, Google Home) is neither
 * `dispatched` nor `skipped`; it runs on this device instead. Surfacing the
 * count here — and the app-must-stay-open caveat — is this feature's UI
 * warning for MANUAL execution (Decision 1a/1b, confirmed by the PO):
 * unlike Decision 5's scheduling limitation (P13, warned ahead of time in
 * ScheduleFormPage), a manual Execute is already a foreground action, so the
 * warning is surfaced at the moment it matters — right after the tap —
 * rather than pre-emptively at scene-configuration time.
 */
function formatDispatchMessage(dispatched: number, skipped: number, deviceSideCount: number): string {
  const dispatchedLabel = `${dispatched} action${dispatched === 1 ? '' : 's'} dispatched`;
  const parts = [dispatchedLabel];
  if (deviceSideCount > 0) {
    parts.push(
      `${deviceSideCount} action${deviceSideCount === 1 ? '' : 's'} running on this device (requires the app to stay open)`,
    );
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }
  return `${parts.join(', ')}.`;
}

/**
 * Format the list of failing providers from a by_provider breakdown.
 * Returns a comma-separated string like "tuya, alexa".
 */
function formatFailingProviders(byProvider: SceneExecutionByProvider[]): string {
  return byProvider
    .filter((p) => p.count_non_success > 0)
    .map((p) => p.provider)
    .join(', ');
}

/**
 * Format the second-stage execution result toast message.
 * Never collapses 'partial_success' into 'success' or 'failure'.
 */
function formatExecutionMessage(
  state: string,
  countSuccess: number,
  countNonSuccess: number,
  byProvider: SceneExecutionByProvider[],
): string {
  const failingProviders = formatFailingProviders(byProvider);

  switch (state) {
    case 'success':
      return `All ${countSuccess} action${countSuccess === 1 ? '' : 's'} succeeded.`;

    case 'partial_success': {
      const providerNote = failingProviders ? ` (${failingProviders})` : '';
      return `Partial: ${countSuccess} succeeded, ${countNonSuccess} failed${providerNote}.`;
    }

    case 'failure': {
      const providerNote = failingProviders ? ` Provider${failingProviders.includes(',') ? 's' : ''}: ${failingProviders}.` : '';
      return `Execution failed.${providerNote}`;
    }

    case 'no_actions':
    default:
      return '';
  }
}

/**
 * Poll GET /api/scenes/{sceneId}/executions/{executionId} until the execution
 * row exists (not 404) and has a terminal state (not pending).
 *
 * Parameters chosen for user experience:
 * - 5 attempts × 1 500 ms interval = up to 7.5 s total wait (covers the typical
 *   queue processing time in staging; fast enough to feel responsive for small scenes).
 * - Any error or timeout is treated as non-blocking: we simply resolve with null
 *   and the dispatch-message toast is already visible.
 */
async function pollExecutionSummary(
  sceneId: number,
  sceneExecutionId: string,
): Promise<ReturnType<typeof formatExecutionMessage> | null> {
  const MAX_ATTEMPTS = 5;
  const INTERVAL_MS = 1_500;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
    try {
      const summary = await sceneDispatchService.getExecutionSummary(sceneId, sceneExecutionId);
      if (summary === null) continue; // 404 — row not yet written, keep polling
      return formatExecutionMessage(
        summary.state,
        summary.count_success,
        summary.count_non_success,
        summary.by_provider,
      );
    } catch {
      // Non-blocking: network blip or unexpected error — stop polling quietly
      return null;
    }
  }
  return null; // exhausted attempts — dispatch toast already shown
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
    const deviceActionIds = result.device_action_ids ?? [];

    // Stage 1: show dispatch count immediately (fire-and-forget confirmed).
    notify(formatDispatchMessage(result.dispatched, result.skipped, deviceActionIds.length));

    // ADR-036 Decision 7 — actions the backend delegated because their
    // provider has no server-side execution capability. Executed on this
    // device (google-home-execution.service.ts) and reported back;
    // fire-and-forget by the same contract as smart-home-dispatch.service.ts
    // — a failure here must never block the toast/poll below or the UI.
    if (deviceActionIds.length > 0) {
      void googleHomeExecutionService
        .executeDeviceSideActions(sceneId, {
          sceneExecutionId: result.scene_execution_id,
          deviceActionIds,
        })
        .catch(() => {});
    }

    // Stage 2: poll for the real execution outcome when we have an ID and at
    // least one action is in flight — either a dispatched job or a
    // device-side action reporting back under the same scene_execution_id
    // (no point polling when the scene had no actions at all).
    if ((result.dispatched > 0 || deviceActionIds.length > 0) && result.scene_execution_id) {
      // Fire polling in the background — non-blocking from the user's perspective.
      void pollExecutionSummary(sceneId, result.scene_execution_id).then((message) => {
        if (message) notify(message);
      });
    }
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
