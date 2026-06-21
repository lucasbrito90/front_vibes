<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Connection</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="provider-detail page-shell">
        <div v-if="offline" class="provider-detail-offline" role="status">
          <ion-icon :icon="cloudOfflineOutline" />
          <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
        </div>

        <AppLoadingState
          v-if="loading && !connection"
          compact
          title="Loading connection…"
        />

        <AppErrorState
          v-else-if="!connection"
          compact
          title="Connection not found"
          :description="error ?? 'This connection may have been deleted.'"
          retry-label="Back to devices"
          @retry="router.replace('/devices')"
        />

        <template v-else>
          <div class="app-surface-card provider-detail-card">
            <div class="provider-detail-head">
              <h2 class="provider-detail-name">{{ connection.name }}</h2>
              <ion-badge :color="statusBadge.color">{{ statusBadge.label }}</ion-badge>
            </div>

            <dl class="provider-detail-meta">
              <div class="provider-detail-row">
                <dt>Provider</dt>
                <dd>{{ providerLabel(connection.provider) }}</dd>
              </div>
              <div class="provider-detail-row">
                <dt>Base URL</dt>
                <dd class="provider-detail-url">{{ connection.config?.base_url }}</dd>
              </div>
              <div class="provider-detail-row">
                <dt>Status</dt>
                <dd>{{ statusBadge.label }}</dd>
              </div>
              <div class="provider-detail-row">
                <dt>Last tested</dt>
                <dd>{{ formatTimestamp(connection.last_tested_at) }}</dd>
              </div>
            </dl>
          </div>

          <div class="provider-detail-actions">
            <ion-button
              expand="block"
              :disabled="offline || syncing"
              @click="runSync"
            >
              <ion-spinner v-if="syncing" name="crescent" />
              <template v-else>
                <ion-icon slot="start" :icon="syncOutline" />
                Sync devices
              </template>
            </ion-button>

            <ion-button
              expand="block"
              fill="outline"
              color="danger"
              :disabled="offline || deleting"
              @click="confirmDelete"
            >
              <ion-icon slot="start" :icon="trashOutline" />
              Delete connection
            </ion-button>
          </div>
        </template>
      </div>

      <ion-toast
        :is-open="showToast"
        :message="toastMessage"
        :duration="3000"
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
import { chevronBackOutline, cloudOfflineOutline, syncOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useDevices } from '@/composables/useDevices';
import { useProviderConnections } from '@/composables/useProviderConnections';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import { connectionStatusBadge, providerLabel } from '@/utils/device-status';

const route = useRoute();
const router = useRouter();
const {
  selectedConnection: connection,
  loading,
  error,
  getConnection,
  deleteConnection,
  syncConnection,
} = useProviderConnections();
const { refreshAfterSync } = useDevices();

const connectionId = Number(route.params.id);
const offline = ref(isDeviceOffline());
const syncing = ref(false);
const deleting = ref(false);
const showToast = ref(false);
const toastMessage = ref('');

const statusBadge = computed(() => connectionStatusBadge(connection.value?.status ?? 'unknown'));

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
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
  void getConnection(connectionId);
});

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

function blockedOffline(): boolean {
  updateOnlineState();
  if (offline.value) {
    notify(DEVICE_OFFLINE_MUTATION_MESSAGE);
    return true;
  }
  return false;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

async function runSync(): Promise<void> {
  if (blockedOffline()) return;
  syncing.value = true;
  try {
    const result = await syncConnection(connectionId);
    if (result) {
      await refreshAfterSync();
      notify(`Synced ${result.synced} device(s).`);
    } else {
      notify(error.value ?? 'Could not sync devices.');
    }
  } finally {
    syncing.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (blockedOffline()) return;

  const alert = await alertController.create({
    header: 'Delete connection',
    message: 'Delete this connection? Its devices will also be removed.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void runDelete();
        },
      },
    ],
  });
  await alert.present();
}

async function runDelete(): Promise<void> {
  if (blockedOffline()) return;
  deleting.value = true;
  try {
    const ok = await deleteConnection(connectionId);
    if (ok) {
      await refreshAfterSync();
      router.replace('/devices');
    } else {
      notify(error.value ?? 'Could not delete connection.');
    }
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.provider-detail {
  padding-top: var(--app-space-4);
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
}

.provider-detail-offline {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-4);
  padding: var(--app-space-3) var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.provider-detail-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.provider-detail-card {
  padding: var(--app-space-5);
}

.provider-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.provider-detail-name {
  margin: 0;
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
}

.provider-detail-meta {
  margin: var(--app-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.provider-detail-row {
  display: flex;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.provider-detail-row dt {
  color: var(--app-color-text-muted);
  font-size: var(--app-font-size-body-sm);
}

.provider-detail-row dd {
  margin: 0;
  text-align: right;
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.provider-detail-url {
  word-break: break-all;
}

.provider-detail-actions {
  margin-top: var(--app-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}
</style>
