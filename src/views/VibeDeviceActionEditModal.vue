<template>
  <ion-page class="action-modal">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="dismiss(false)">Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit action' : 'Add action' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            fill="clear"
            :disabled="saving || offline || !canSave"
            @click="handleSave"
          >
            <ion-spinner v-if="saving" name="crescent" />
            <span v-else>Save</span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div v-if="offline" class="action-offline" role="status">
        <ion-icon :icon="cloudOfflineOutline" />
        <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
      </div>

      <div v-if="!devices.length" class="action-empty">
        <ion-icon :icon="bulbOutline" />
        <p>No devices yet. Add and sync a provider connection first.</p>
      </div>

      <template v-else>
        <ion-item lines="full">
          <ion-select
            v-model="form.device_id"
            label="Device"
            label-placement="floating"
            placeholder="Select a device"
            :disabled="offline || saving"
            interface="action-sheet"
          >
            <ion-select-option v-for="d in devices" :key="d.id" :value="d.id">
              {{ d.name }} ({{ deviceStatusBadge(d.status).label }})
            </ion-select-option>
          </ion-select>
        </ion-item>
        <p v-if="errors.device_id" class="action-field-error">{{ errors.device_id }}</p>

        <div v-if="selectedDevice" class="action-device-status">
          <span>Status</span>
          <ion-badge :color="deviceStatusBadge(selectedDevice.status).color">
            {{ deviceStatusBadge(selectedDevice.status).label }}
          </ion-badge>
        </div>

        <ion-item lines="full">
          <ion-select
            v-model="form.action_type"
            label="Action"
            label-placement="floating"
            placeholder="Select an action"
            :disabled="offline || saving"
            interface="action-sheet"
          >
            <ion-select-option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <p v-if="errors.action_type" class="action-field-error">{{ errors.action_type }}</p>

        <ion-item lines="full">
          <ion-input
            v-model.number="form.delay_seconds"
            type="number"
            inputmode="numeric"
            label="Delay (seconds)"
            label-placement="floating"
            placeholder="0"
            :min="0"
            :max="MAX_DELAY_SECONDS"
            :disabled="offline || saving"
          />
        </ion-item>
        <p v-if="errors.delay_seconds" class="action-field-error">{{ errors.delay_seconds }}</p>
        <p class="action-field-hint">Wait this long before the action runs (0–{{ MAX_DELAY_SECONDS }}s).</p>

        <p v-if="error" class="action-error">{{ error }}</p>
      </template>
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from '@ionic/vue';
import { bulbOutline, cloudOfflineOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useDevices } from '@/composables/useDevices';
import { useVibeDeviceActions } from '@/composables/useVibeDeviceActions';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import type { ActionType, VibeDeviceAction } from '@/services/vibe-device-action.service';
import { deviceStatusBadge } from '@/utils/device-status';
import {
  actionTypeOptions,
  MAX_DELAY_SECONDS,
  validateActionDraft,
} from '@/utils/device-action';

const props = defineProps<{
  vibeId: number;
  /** When provided, the modal edits this action; otherwise it creates a new one. */
  action?: VibeDeviceAction | null;
}>();

const { devices, fetchDevices } = useDevices();
const { createAction, updateAction, error, clearError } = useVibeDeviceActions();

const isEdit = computed(() => props.action != null);
const actionOptions = actionTypeOptions();
const offline = ref(isDeviceOffline());
const saving = ref(false);

const form = reactive<{
  device_id: number | null;
  action_type: ActionType | null;
  delay_seconds: number;
}>({
  device_id: props.action?.device_id ?? null,
  action_type: (props.action?.action_type as ActionType | undefined) ?? null,
  delay_seconds: props.action?.delay_seconds ?? 0,
});

const selectedDevice = computed(() => devices.value.find((d) => d.id === form.device_id) ?? null);

const errors = computed(() =>
  validateActionDraft({
    device_id: form.device_id ?? undefined,
    action_type: form.action_type ?? undefined,
    delay_seconds: Number(form.delay_seconds),
  }),
);

const canSave = computed(() => Object.keys(errors.value).length === 0);

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

onMounted(() => {
  clearError();
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  if (!devices.value.length) {
    void fetchDevices();
  }
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});

async function dismiss(saved: boolean): Promise<void> {
  await modalController.dismiss({ saved });
}

async function handleSave(): Promise<void> {
  updateOnlineState();
  if (offline.value || !canSave.value) return;

  saving.value = true;
  clearError();

  const payload = {
    device_id: form.device_id as number,
    action_type: form.action_type as ActionType,
    delay_seconds: Number(form.delay_seconds) || 0,
  };

  const result = isEdit.value
    ? await updateAction(props.vibeId, props.action!.id, payload)
    : await createAction(props.vibeId, payload);

  saving.value = false;

  if (result) {
    await dismiss(true);
  }
}
</script>

<style scoped>
.action-offline {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-3) var(--app-space-4);
  margin-bottom: var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.action-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.action-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-10) var(--app-space-6);
  text-align: center;
  color: var(--app-color-text-muted);
}

.action-empty ion-icon {
  font-size: 40px;
}

.action-device-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--app-space-3) var(--app-space-1) 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-muted);
}

.action-field-error {
  margin: var(--app-space-1) 0 0;
  padding-left: var(--app-space-1);
  font-size: var(--app-font-size-caption);
  color: var(--ion-color-danger);
}

.action-field-hint {
  margin: var(--app-space-1) 0 0;
  padding-left: var(--app-space-1);
  font-size: var(--app-font-size-caption);
  color: var(--app-color-text-tertiary);
}

.action-error {
  margin-top: var(--app-space-4);
  font-size: var(--app-font-size-body-sm);
  color: var(--ion-color-danger);
}
</style>
