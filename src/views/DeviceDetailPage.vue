<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Device</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="device-detail page-shell">
        <div v-if="offline" class="device-detail-offline" role="status">
          <ion-icon :icon="cloudOfflineOutline" />
          <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
        </div>

        <AppLoadingState
          v-if="loading && !device"
          compact
          title="Loading device…"
        />

        <AppErrorState
          v-else-if="!device"
          compact
          title="Device not found"
          :description="error ?? 'This device may have been removed.'"
          retry-label="Back to devices"
          @retry="router.replace('/devices')"
        />

        <template v-else>
          <div class="app-surface-card device-detail-card">
            <div class="device-detail-head">
              <h2 class="device-detail-name">{{ device.name }}</h2>
              <ion-badge :color="statusBadge.color">{{ statusBadge.label }}</ion-badge>
            </div>

            <dl class="device-detail-meta">
              <div class="device-detail-row">
                <dt>Provider</dt>
                <dd>{{ providerLabel(device.provider) }}</dd>
              </div>
              <div class="device-detail-row">
                <dt>Provider device ID</dt>
                <dd class="device-detail-mono">{{ device.provider_device_id }}</dd>
              </div>
              <div class="device-detail-row">
                <dt>Status</dt>
                <dd>{{ statusBadge.label }}</dd>
              </div>
              <div class="device-detail-row">
                <dt>Last seen</dt>
                <dd>{{ formatTimestamp(device.last_seen_at) }}</dd>
              </div>
            </dl>
          </div>

          <form class="app-surface-card device-detail-form" @submit.prevent="handleSave">
            <h3 class="device-detail-form-title">Edit device</h3>

            <ion-item class="auth-item" lines="none">
              <ion-input
                v-model="form.name"
                label="Name"
                label-placement="floating"
                :disabled="offline || saving"
                required
              />
            </ion-item>

            <ion-item class="auth-item" lines="none">
              <ion-input
                v-model="form.type"
                label="Type"
                label-placement="floating"
                placeholder="e.g. light, switch"
                :disabled="offline || saving"
              />
            </ion-item>

            <ion-button
              type="submit"
              expand="block"
              class="device-detail-save"
              :disabled="offline || saving || !canSave"
            >
              <ion-spinner v-if="saving" name="crescent" />
              <span v-else>Save changes</span>
            </ion-button>
          </form>

          <div v-if="hasMetadata" class="app-surface-card device-detail-card">
            <h3 class="device-detail-form-title">Metadata</h3>
            <dl class="device-detail-meta">
              <div
                v-for="(value, key) in device.metadata ?? {}"
                :key="key"
                class="device-detail-row"
              >
                <dt>{{ key }}</dt>
                <dd class="device-detail-mono">{{ stringifyValue(value) }}</dd>
              </div>
            </dl>
          </div>

          <ion-button
            expand="block"
            fill="outline"
            color="danger"
            class="device-detail-delete"
            :disabled="offline || deleting"
            @click="confirmDelete"
          >
            <ion-icon slot="start" :icon="trashOutline" />
            Delete device
          </ion-button>
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
  IonInput,
  IonItem,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from '@ionic/vue';
import { chevronBackOutline, cloudOfflineOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useDevices } from '@/composables/useDevices';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import { deviceStatusBadge, providerLabel } from '@/utils/device-status';

const route = useRoute();
const router = useRouter();
const {
  selectedDevice: device,
  loading,
  error,
  getDevice,
  updateDevice,
  deleteDevice,
} = useDevices();

const deviceId = Number(route.params.id);
const offline = ref(isDeviceOffline());
const saving = ref(false);
const deleting = ref(false);
const showToast = ref(false);
const toastMessage = ref('');

const form = reactive<{ name: string; type: string }>({ name: '', type: '' });

const statusBadge = computed(() => deviceStatusBadge(device.value?.status ?? 'unknown'));
const hasMetadata = computed(
  () => !!device.value?.metadata && Object.keys(device.value.metadata).length > 0,
);
const canSave = computed(() => form.name.trim().length > 0);

watch(
  device,
  (value) => {
    if (value) {
      form.name = value.name;
      form.type = value.type ?? '';
    }
  },
  { immediate: true },
);

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
  void getDevice(deviceId);
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

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function handleSave(): Promise<void> {
  if (blockedOffline()) return;
  if (!canSave.value) return;
  saving.value = true;
  try {
    const updated = await updateDevice(deviceId, {
      name: form.name.trim(),
      type: form.type.trim(),
    });
    notify(updated ? 'Device updated.' : error.value ?? 'Could not update device.');
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (blockedOffline()) return;

  const alert = await alertController.create({
    header: 'Delete device',
    message: 'Remove this device from IXORA? It can be re-imported by syncing the provider.',
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
    const ok = await deleteDevice(deviceId);
    if (ok) {
      router.replace('/devices');
    } else {
      notify(error.value ?? 'Could not delete device.');
    }
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.device-detail {
  padding-top: var(--app-space-4);
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.device-detail-offline {
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

.device-detail-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.device-detail-card,
.device-detail-form {
  padding: var(--app-space-5);
}

.device-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.device-detail-name {
  margin: 0;
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
}

.device-detail-meta {
  margin: var(--app-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.device-detail-row {
  display: flex;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.device-detail-row dt {
  color: var(--app-color-text-muted);
  font-size: var(--app-font-size-body-sm);
}

.device-detail-row dd {
  margin: 0;
  text-align: right;
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.device-detail-mono {
  word-break: break-all;
  font-family: var(--ion-font-family-monospace, monospace);
}

.device-detail-form-title {
  margin: 0 0 var(--app-space-3);
  font-size: var(--app-font-size-body-md);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-primary);
}

.device-detail-save {
  margin-top: var(--app-space-4);
}

.device-detail-delete {
  margin-top: var(--app-space-2);
}
</style>
