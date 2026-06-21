<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Device Actions</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="actions-page page-shell">
        <div v-if="offline" class="actions-offline" role="status">
          <ion-icon :icon="cloudOfflineOutline" />
          <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
        </div>

        <p class="actions-intro">
          Smart home actions run when this vibe plays. They are applied in order, top to bottom.
        </p>

        <AppLoadingState
          v-if="loading && !list.length"
          class="actions-state-slot"
          compact
          title="Loading actions…"
        />

        <AppErrorState
          v-else-if="error && !list.length"
          class="actions-state-slot"
          compact
          title="Couldn’t load actions"
          :description="error"
          retry-label="Retry"
          @retry="reload"
        />

        <AppEmptyState
          v-else-if="!list.length"
          class="actions-state-slot"
          variant="card"
          :icon="bulbOutline"
          title="No device actions yet"
          description="Attach a smart home action — like turning a light on — to this vibe."
          action-label="Add action"
          @action="openAdd"
        />

        <div v-else class="actions-list">
          <article
            v-for="(action, index) in list"
            :key="action.id"
            class="action-card app-surface-card"
          >
            <div class="action-card-reorder">
              <button
                class="action-reorder-btn"
                :disabled="index === 0 || offline || loading"
                aria-label="Move up"
                @click="moveUp(index)"
              >
                <ion-icon :icon="chevronUpOutline" />
              </button>
              <span class="action-reorder-pos">{{ index + 1 }}</span>
              <button
                class="action-reorder-btn"
                :disabled="index === list.length - 1 || offline || loading"
                aria-label="Move down"
                @click="moveDown(index)"
              >
                <ion-icon :icon="chevronDownOutline" />
              </button>
            </div>

            <div class="action-card-body" @click="openEdit(action)">
              <div class="action-card-head">
                <span class="action-card-device">{{ action.device?.name ?? `Device #${action.device_id}` }}</span>
                <ion-badge :color="badgeFor(action).color">{{ badgeFor(action).label }}</ion-badge>
              </div>
              <div class="action-card-meta">
                <span class="action-card-type">{{ actionTypeLabel(action.action_type) }}</span>
                <span class="action-card-dot" aria-hidden="true">·</span>
                <span class="action-card-delay">
                  <ion-icon :icon="timeOutline" />
                  {{ action.delay_seconds }}s delay
                </span>
              </div>
            </div>

            <div class="action-card-actions">
              <button class="action-icon-btn" aria-label="Edit action" @click="openEdit(action)">
                <ion-icon :icon="pencilOutline" />
              </button>
              <button
                class="action-icon-btn danger"
                aria-label="Delete action"
                :disabled="offline || loading"
                @click="confirmDelete(action)"
              >
                <ion-icon :icon="trashOutline" />
              </button>
            </div>
          </article>
        </div>
      </div>

      <ion-fab v-if="list.length" slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button color="primary" :disabled="offline" @click="openAdd">
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
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToast,
  IonToolbar,
  alertController,
  modalController,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  addOutline,
  bulbOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronUpOutline,
  cloudOfflineOutline,
  pencilOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useVibeDeviceActions } from '@/composables/useVibeDeviceActions';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import type { VibeDeviceAction } from '@/services/vibe-device-action.service';
import { deviceStatusBadge, type StatusBadge } from '@/utils/device-status';
import { actionTypeLabel } from '@/utils/device-action';
import VibeDeviceActionEditModal from '@/views/VibeDeviceActionEditModal.vue';

const route = useRoute();
const router = useRouter();
const vibeId = Number(route.params.id);

const {
  list,
  loading,
  error,
  fetchActions,
  deleteAction,
  reorderActions,
} = useVibeDeviceActions();

const offline = ref(isDeviceOffline());
const showToast = ref(false);
const toastMessage = ref('');

function badgeFor(action: VibeDeviceAction): StatusBadge {
  return deviceStatusBadge(action.device?.status ?? 'unknown');
}

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
  void fetchActions(vibeId);
});

async function reload(): Promise<void> {
  await fetchActions(vibeId);
}

async function presentModal(action: VibeDeviceAction | null): Promise<void> {
  const modal = await modalController.create({
    component: VibeDeviceActionEditModal,
    componentProps: { vibeId, action },
  });
  modal.onDidDismiss().then(({ data }) => {
    if (data?.saved) {
      notify(action ? 'Action updated.' : 'Action added.');
    }
  });
  await modal.present();
}

async function openAdd(): Promise<void> {
  if (blockedOffline()) return;
  await presentModal(null);
}

async function openEdit(action: VibeDeviceAction): Promise<void> {
  if (blockedOffline()) return;
  await presentModal(action);
}

async function persistOrder(orderedIds: number[]): Promise<void> {
  if (blockedOffline()) return;
  const ok = await reorderActions(vibeId, orderedIds);
  if (!ok) {
    notify(error.value ?? 'Could not reorder actions.');
  }
}

async function moveUp(index: number): Promise<void> {
  if (index <= 0) return;
  const ids = list.value.map((a) => a.id);
  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
  await persistOrder(ids);
}

async function moveDown(index: number): Promise<void> {
  if (index >= list.value.length - 1) return;
  const ids = list.value.map((a) => a.id);
  [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
  await persistOrder(ids);
}

async function confirmDelete(action: VibeDeviceAction): Promise<void> {
  if (blockedOffline()) return;

  const alert = await alertController.create({
    header: 'Delete action',
    message: `Remove "${actionTypeLabel(action.action_type)}" on ${action.device?.name ?? 'this device'} from this vibe?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void runDelete(action.id);
        },
      },
    ],
  });
  await alert.present();
}

async function runDelete(actionId: number): Promise<void> {
  if (blockedOffline()) return;
  const ok = await deleteAction(vibeId, actionId);
  notify(ok ? 'Action deleted.' : error.value ?? 'Could not delete action.');
}
</script>

<style scoped>
.actions-page {
  padding-top: var(--app-space-4);
  padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.actions-offline {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-3) var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.actions-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.actions-intro {
  margin: 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-muted);
  line-height: 1.45;
}

.actions-state-slot {
  margin-top: var(--app-space-6);
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.action-card {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
}

.action-card-reorder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-1);
  flex-shrink: 0;
}

.action-reorder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--app-color-border);
  background: var(--app-color-surface);
  color: var(--app-color-text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 0;
}

.action-reorder-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-reorder-pos {
  font-size: var(--app-font-size-caption);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-muted);
}

.action-card-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.action-card-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}

.action-card-device {
  font-size: var(--app-font-size-body-md);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-card-meta {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-top: var(--app-space-1);
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-muted);
}

.action-card-type {
  font-weight: var(--app-font-weight-semibold);
  color: var(--ion-color-primary);
}

.action-card-dot {
  opacity: 0.5;
}

.action-card-delay {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-card-delay ion-icon {
  font-size: 14px;
}

.action-card-actions {
  display: flex;
  gap: var(--app-space-2);
  flex-shrink: 0;
}

.action-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--app-color-border);
  background: var(--app-color-surface);
  color: var(--app-color-text-secondary);
  font-size: 17px;
  cursor: pointer;
  padding: 0;
}

.action-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-icon-btn.danger {
  color: var(--ion-color-danger);
  border-color: rgba(239, 68, 68, 0.4);
}
</style>
