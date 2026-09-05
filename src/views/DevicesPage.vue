<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Devices</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="hasConnection"
            fill="clear"
            aria-label="Sync devices"
            :disabled="offline || syncing"
            @click="runSync"
          >
            <ion-icon :icon="syncOutline" />
          </ion-button>
          <ion-button
            fill="clear"
            aria-label="Add provider connection"
            :disabled="offline"
            @click="goAddProvider"
          >
            <ion-icon :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="devices-content page-shell">
        <div v-if="offline" class="devices-offline-banner" role="status">
          <ion-icon :icon="cloudOfflineOutline" />
          <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
        </div>

        <div v-if="hasConnection && !offline" class="devices-connection-row">
          <button type="button" class="devices-connection-chip" @click="goProviderDetail">
            <ion-icon :icon="hardwareChipOutline" aria-hidden="true" />
            <span class="devices-connection-name">{{ primaryConnection?.name }}</span>
            <ion-badge :color="connectionBadge.color">{{ connectionBadge.label }}</ion-badge>
          </button>
        </div>

        <AppLoadingState
          v-if="listLoading && !devices.length"
          class="devices-state-slot"
          compact
          title="Loading your devices…"
        />

        <AppErrorState
          v-else-if="listError && !devices.length"
          class="devices-state-slot"
          compact
          title="Couldn't load devices"
          :description="listError ?? ''"
          retry-label="Retry"
          @retry="fetchDevices"
        />

        <AppEmptyState
          v-else-if="!devices.length && !hasConnection"
          class="devices-state-slot"
          variant="card"
          :icon="hardwareChipOutline"
          title="Connect your smart home"
          description="Add a smart home connection to import and control your devices from IXORA."
          :action-label="offline ? undefined : 'Add connection'"
          @action="goAddProvider"
        />

        <AppEmptyState
          v-else-if="!devices.length"
          class="devices-state-slot"
          variant="card"
          :icon="hardwareChipOutline"
          title="No devices yet"
          :description="
            offline
              ? 'Reconnect to sync devices from your provider.'
              : 'Sync your provider connection to import devices.'
          "
          :action-label="offline ? undefined : 'Sync devices'"
          @action="runSync"
        />

        <div v-else class="devices-list">
          <article
            v-for="device in devices"
            :key="device.id"
            class="app-surface-card device-card app-card-enter"
            role="button"
            tabindex="0"
            @click="goDeviceDetail(device.id)"
            @keyup.enter="goDeviceDetail(device.id)"
          >
            <div class="device-card-head">
              <div class="device-card-title-wrap">
                <h2 class="device-card-name">{{ device.name }}</h2>
                <span class="device-card-type">
                  <ion-icon
                    :icon="deviceTypeInfo(device.type).icon"
                    aria-hidden="true"
                    class="device-type-icon"
                  />
                  {{ deviceTypeInfo(device.type).label }}
                </span>
              </div>
              <ion-badge :color="statusBadge(device.status).color">
                {{ statusBadge(device.status).label }}
              </ion-badge>
            </div>

            <dl class="device-card-meta">
              <div class="device-card-meta-row">
                <ion-icon :icon="hardwareChipOutline" aria-hidden="true" />
                <dd>{{ providerLabel(device.provider, providerTypes) }}</dd>
              </div>
              <div class="device-card-meta-row">
                <ion-icon :icon="pricetagOutline" aria-hidden="true" />
                <dd>{{ device.provider_device_id }}</dd>
              </div>
            </dl>
          </article>
        </div>
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
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToast,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue';
import type { RefresherCustomEvent } from '@ionic/vue';
import {
  addOutline,
  cloudOfflineOutline,
  hardwareChipOutline,
  pricetagOutline,
  syncOutline,
} from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useDevices } from '@/composables/useDevices';
import { useProviderConnections } from '@/composables/useProviderConnections';
import { useProviderTypes } from '@/composables/useProviderTypes';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import {
  connectionStatusBadge,
  deviceStatusBadge as statusBadge,
  deviceTypeInfo,
  providerLabel,
} from '@/utils/device-status';

const router = useRouter();
const { devices, listLoading, listError, fetchDevices, refreshAfterSync } = useDevices();
const {
  hasConnection,
  primaryConnection,
  fetchConnections,
  syncConnection,
} = useProviderConnections();
const { providerTypes, fetchProviderTypes } = useProviderTypes();

const offline = ref(isDeviceOffline());
const syncing = ref(false);
const showToast = ref(false);
const toastMessage = ref('');

const connectionBadge = computed(() =>
  connectionStatusBadge(primaryConnection.value?.status ?? 'unknown'),
);

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

onMounted(() => {
  window.addEventListener('online', onNetworkChange);
  window.addEventListener('offline', onNetworkChange);
});

onUnmounted(() => {
  window.removeEventListener('online', onNetworkChange);
  window.removeEventListener('offline', onNetworkChange);
});

function onNetworkChange(): void {
  updateOnlineState();
  void fetchConnections();
  void fetchDevices();
  void fetchProviderTypes();
}

onIonViewWillEnter(() => {
  updateOnlineState();
  void fetchConnections();
  void fetchDevices();
  void fetchProviderTypes();
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

function goAddProvider(): void {
  if (blockedOffline()) return;
  router.push('/devices/providers/new');
}

function goProviderDetail(): void {
  if (primaryConnection.value) {
    router.push(`/devices/providers/${primaryConnection.value.id}`);
  }
}

function goDeviceDetail(id: number): void {
  router.push(`/devices/${id}`);
}

async function onRefresh(event: RefresherCustomEvent): Promise<void> {
  updateOnlineState();
  await fetchConnections();
  await fetchDevices();
  await fetchProviderTypes();
  await event.target.complete();
}

async function runSync(): Promise<void> {
  if (blockedOffline()) return;
  if (!primaryConnection.value) {
    notify('Add a connection first.');
    return;
  }
  syncing.value = true;
  try {
    const result = await syncConnection(primaryConnection.value.id);
    if (result) {
      await refreshAfterSync();
      notify(`Synced ${result.synced} device(s).`);
    } else {
      notify('Could not sync devices.');
    }
  } finally {
    syncing.value = false;
  }
}
</script>

<style scoped>
.devices-content {
  padding-top: var(--app-space-2);
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
}

.devices-state-slot {
  margin-top: var(--app-space-6);
}

.devices-offline-banner {
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

.devices-offline-banner ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.devices-connection-row {
  margin-bottom: var(--app-space-4);
}

.devices-connection-chip {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  width: 100%;
  padding: var(--app-space-3) var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-primary);
  font-size: var(--app-font-size-body-sm);
  cursor: pointer;
}

.devices-connection-name {
  flex: 1;
  text-align: left;
  font-weight: var(--app-font-weight-semibold);
}

.devices-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.device-card {
  padding: var(--app-space-5);
  cursor: pointer;
}

.device-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.device-card-title-wrap {
  min-width: 0;
}

.device-card-name {
  margin: 0;
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
  line-height: var(--app-line-height-heading-tight);
}

.device-card-type {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  text-transform: capitalize;
}

.device-type-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.device-card-meta {
  margin: var(--app-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.device-card-meta-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}

.device-card-meta-row ion-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--app-color-text-muted);
}

.device-card-meta dd {
  margin: 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  word-break: break-all;
}
</style>
