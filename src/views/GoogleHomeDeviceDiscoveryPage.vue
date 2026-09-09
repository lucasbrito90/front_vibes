<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Discover Google Home devices</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="ghd-screen page-shell">
        <AppLoadingState
          v-if="phase === 'loading'"
          compact
          title="Checking connection…"
        />

        <AppErrorState
          v-else-if="phase === 'connection-not-found'"
          compact
          title="Connection not found"
          description="This connection may have been deleted."
          retry-label="Back to devices"
          @retry="router.replace('/devices')"
        />

        <AppErrorState
          v-else-if="phase === 'capability-unsupported'"
          compact
          title="Not supported"
          description="This provider does not support discovering devices from this screen."
          retry-label="Back"
          @retry="router.back()"
        />

        <AppErrorState
          v-else-if="phase === 'platform-unsupported'"
          compact
          title="Android required"
          description="Google Home discovery is only available in the IXORA Android app."
          retry-label="Back"
          @retry="router.back()"
        />

        <AppLoadingState
          v-else-if="phase === 'requesting-permission'"
          compact
          title="Requesting Google Home permission…"
        />

        <AppEmptyState
          v-else-if="phase === 'permission-cancelled'"
          compact
          :icon="logoGoogle"
          title="Permission not granted"
          description="IXORA needs permission to see your Google Home devices. Nothing was created or changed — your connection is still saved."
          action-label="Try again"
          @action="retryPermission"
        />

        <AppErrorState
          v-else-if="phase === 'permission-error'"
          compact
          title="Couldn't connect to Google Home"
          :description="errorMessage ?? 'Something went wrong requesting permission.'"
          retry-label="Try again"
          @retry="retryPermission"
        />

        <AppLoadingState
          v-else-if="phase === 'discovering'"
          compact
          title="Looking for Google Home devices…"
        />

        <AppErrorState
          v-else-if="phase === 'discovery-error'"
          compact
          title="Couldn't load devices"
          :description="errorMessage ?? 'Something went wrong.'"
          retry-label="Try again"
          @retry="refreshDiscovery"
        />

        <AppEmptyState
          v-else-if="phase === 'discovery-empty'"
          compact
          :icon="hardwareChipOutline"
          title="No devices found"
          description="Make sure your Google Home devices are set up in the Google Home app, then try again."
          action-label="Refresh"
          @action="refreshDiscovery"
        />

        <div v-else class="ghd-selection">
          <p class="ghd-hint">Select the devices you want to add to IXORA.</p>

          <ion-list class="ghd-list">
            <ion-item
              v-for="device in devices"
              :key="device.provider_device_id"
              class="ghd-list-item"
              lines="none"
              button
              :disabled="phase === 'syncing'"
              @click="toggleSelection(device.provider_device_id)"
            >
              <ion-icon
                slot="start"
                :icon="deviceTypeInfo(device.type).icon"
                aria-hidden="true"
              />
              <ion-label>{{ device.name }}</ion-label>
              <ion-checkbox
                slot="end"
                :checked="device.selected"
                :disabled="phase === 'syncing'"
                @click.stop="toggleSelection(device.provider_device_id)"
              />
            </ion-item>
          </ion-list>

          <p v-if="phase === 'sync-error'" class="ghd-error" role="alert">
            {{ errorMessage ?? 'Could not sync devices.' }}
          </p>

          <ion-button
            expand="block"
            class="ghd-submit"
            :disabled="!hasSelection || phase === 'syncing'"
            @click="handleConfirm"
          >
            <ion-spinner v-if="phase === 'syncing'" name="crescent" />
            <span v-else>Add {{ selectedCount }} device{{ selectedCount === 1 ? '' : 's' }}</span>
          </ion-button>
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
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue';
import { chevronBackOutline, hardwareChipOutline, logoGoogle } from 'ionicons/icons';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useGoogleHomeDiscovery } from '@/composables/useGoogleHomeDiscovery';
import { deviceTypeInfo } from '@/utils/device-status';

const route = useRoute();
const router = useRouter();
const connectionId = Number(route.params.id);

const {
  phase,
  errorMessage,
  devices,
  selectedCount,
  hasSelection,
  start,
  retryPermission,
  refreshDiscovery,
  toggleSelection,
  confirmSync,
} = useGoogleHomeDiscovery();

const showToast = ref(false);
const toastMessage = ref('');

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

onIonViewWillEnter(() => {
  void start(connectionId);
});

async function handleConfirm(): Promise<void> {
  const result = await confirmSync();
  if (result) {
    notify(`Synced ${result.synced} device(s).`);
    router.replace('/devices');
  }
  // On failure, errorMessage/phase are already updated by the composable and
  // the current selection is preserved — the user can retry with the same
  // button without re-running discovery.
}
</script>

<style scoped>
.ghd-screen {
  padding-top: var(--app-space-4);
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
}

.ghd-hint {
  margin: 0 0 var(--app-space-4);
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
}

.ghd-list {
  background: transparent;
  padding: 0;
}

.ghd-list-item {
  --background: var(--app-color-surface);
  --border-radius: var(--app-radius-md);
  margin-bottom: var(--app-space-2);
}

.ghd-error {
  margin: var(--app-space-3) 0 0;
  color: var(--ion-color-danger, #c0392b);
  font-size: var(--app-font-size-body-sm);
}

.ghd-submit {
  margin-top: var(--app-space-5);
  min-height: 48px;
}
</style>
