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

        <!--
          CSDM-06: the control is derived from the capability's constraint, not
          from the action name. A numeric constraint renders a range; an enum
          renders a picker. Nothing here knows what a provider is, and no
          native scale reaches the user — the value is canonical.
        -->
        <template v-if="valueConstraint">
          <ion-item v-if="valueConstraint.type === 'number'" lines="full">
            <ion-range
              :model-value="numericValue"
              @ion-input="onRangeInput"
              :min="valueConstraint.min ?? 0"
              :max="valueConstraint.max ?? 100"
              :step="valueConstraint.step ?? 1"
              :disabled="offline || saving"
              :pin="true"
              :label="`${valueLabel} (${valueConstraint.unit})`"
              label-placement="stacked"
            />
          </ion-item>

          <ion-item v-else-if="valueConstraint.type === 'enum'" lines="full">
            <ion-select
              v-model="form.value"
              :label="valueLabel"
              label-placement="floating"
              :disabled="offline || saving"
              interface="action-sheet"
            >
              <ion-select-option
                v-for="allowed in valueConstraint.allowed_values"
                :key="allowed"
                :value="allowed"
              >
                {{ allowed }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <p v-if="errors.value" class="action-field-error">{{ errors.value }}</p>
        </template>

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

        <p v-if="delayNeedsAppOpen" class="action-field-warning">
          This device is controlled by the phone, so a delay this long only runs
          while the app stays open. It is reliable while a Vibe is playing.
        </p>

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
  IonRange,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from '@ionic/vue';
import { bulbOutline, cloudOfflineOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useDevices } from '@/composables/useDevices';
import { useProviderTypes } from '@/composables/useProviderTypes';
import { useSceneDeviceActions } from '@/composables/useSceneDeviceActions';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
} from '@/services/provider-connection.service';
import {
  actionValueLabel,
  buildParameters,
  constraintForAction,
  defaultValueFor,
  parseCapabilities,
  validateCanonicalValue,
} from '@/utils/canonical-capabilities';
import type { ActionType, SceneDeviceAction } from '@/services/scene-device-action.service';
import { deviceStatusBadge } from '@/utils/device-status';
import {
  availableActionTypeOptions,
  delayNeedsAppOpen as delayNeedsAppOpenFor,
  MAX_DELAY_SECONDS,
  validateActionDraft,
} from '@/utils/device-action';

const props = defineProps<{
  sceneId: number;
  /** When provided, the modal edits this action; otherwise it creates a new one. */
  action?: SceneDeviceAction | null;
}>();

const { devices, fetchDevices } = useDevices();
const { createAction, updateAction, error, clearError } = useSceneDeviceActions();

const isEdit = computed(() => props.action != null);

/**
 * The action type that was already saved when opening in edit mode.
 * Always kept in the option list so existing saves are never hidden.
 */
const originalActionType = (props.action?.action_type as ActionType | undefined) ?? null;

const offline = ref(isDeviceOffline());
const saving = ref(false);

const form = reactive<{
  device_id: number | null;
  action_type: ActionType | null;
  delay_seconds: number;
  /** Canonical parameter value (ADR-037 §12); null when the action takes none. */
  value: number | string | boolean | null;
}>({
  device_id: props.action?.device_id ?? null,
  action_type: (props.action?.action_type as ActionType | undefined) ?? null,
  delay_seconds: props.action?.delay_seconds ?? 0,
  // Canonical parameter value (ADR-037 §12). Restored from a saved action when
  // editing, so reopening an existing brightness shows what the user chose.
  value: (props.action?.parameters?.value ?? null) as number | string | boolean | null,
});

const selectedDevice = computed(() => devices.value.find((d) => d.id === form.device_id) ?? null);

const { providerTypes, fetchProviderTypes, findProviderType } = useProviderTypes();

/**
 * Warn when a long delay is one the app itself has to hold.
 *
 * A server-side delay is held by the queue and runs whether or not the phone
 * is even switched on; a device-side one is a timer inside this app. Saying so
 * is better than a field that silently means two different things depending on
 * which device it is attached to.
 *
 * Derived from execution_capabilities, never a provider slug — the same rule
 * as useScheduleExecutionWarning. While provider types are still loading the
 * warning stays hidden rather than flashing on and off.
 */
const delayNeedsAppOpen = computed(() => {
  const device = selectedDevice.value;

  if (device === null || providerTypes.value.length === 0) {
    return false;
  }

  return delayNeedsAppOpenFor(
    findProviderType(device.provider)?.execution_capabilities,
    Number(form.delay_seconds),
  );
});

/**
 * Reactive action type options filtered by the selected device's capabilities.
 * Fail-open: null capabilities → all three options always appear.
 * In edit mode the original saved type is always included so the UI never
 * hides a value the user already chose.
 */
const actionOptions = computed(() =>
  availableActionTypeOptions(selectedDevice.value?.capabilities, originalActionType),
);

/**
 * CSDM-06 — the control the user sees comes from the capability's constraint.
 *
 * `null` means the selected action carries no value (turn_on and friends) or
 * the device declares no constraint for it, in which case nothing is rendered
 * and nothing is sent.
 */
const deviceCapabilities = computed(() => parseCapabilities(selectedDevice.value?.capabilities));

const valueConstraint = computed(() =>
  form.action_type ? constraintForAction(deviceCapabilities.value, form.action_type) : null,
);

const valueLabel = computed(() =>
  form.action_type ? actionValueLabel(form.action_type) : 'Value',
);

/**
 * `ion-range` speaks numbers only, while `form.value` holds whatever the
 * capability's constraint calls for — a number, an enum string, a boolean.
 * Bridging here keeps the canonical value one field rather than one per
 * control type.
 */
const numericValue = computed(() => (typeof form.value === 'number' ? form.value : 0));

function onRangeInput(event: CustomEvent): void {
  const detail = event.detail as { value?: number | { lower: number; upper: number } };

  if (typeof detail.value === 'number') {
    form.value = detail.value;
  }
}

/**
 * Seed the control when the action changes, and clear it when the new action
 * carries no value — leaving a stale brightness on a turn_off would send a
 * parameter the operation does not take.
 */
watch(
  () => form.action_type,
  () => {
    form.value = valueConstraint.value ? defaultValueFor(valueConstraint.value) : null;
  },
);

/**
 * When the device changes, check whether the currently selected action type
 * is still in the new set of allowed options. If not (and it isn't the
 * original edit value), clear it — an invalid action must not be submitted.
 */
watch(
  () => form.device_id,
  () => {
    const current = form.action_type;
    if (current && !actionOptions.value.some((opt) => opt.value === current)) {
      // Only clear when switching devices in create mode, or when the new
      // device no longer supports even the original type.
      if (current !== originalActionType) {
        form.action_type = null;
      }
    }
  },
);

const errors = computed(() => {
  const base: Record<string, string | undefined> = validateActionDraft({
    device_id: form.device_id ?? undefined,
    action_type: form.action_type ?? undefined,
    delay_seconds: Number(form.delay_seconds),
  });

  // Mirrors the backend's CommandValidator so the user is told before the
  // request, not by a 422 afterwards. Laravel remains the authority.
  const valueError = valueConstraint.value
    ? validateCanonicalValue(valueConstraint.value, form.value, valueLabel.value)
    : null;

  return valueError ? { ...base, value: valueError } : base;
});

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
  if (!providerTypes.value.length) {
    // Advisory only: fetchProviderTypes() records failures on its own error
    // ref rather than throwing, and an empty list simply hides the warning.
    void fetchProviderTypes();
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
    // The canonical parameter key, on the domain's own scale (ADR-037 §12).
    // `null` for an operation that takes no value, so a stale control never
    // leaks a parameter into a turn_off.
    parameters: buildParameters(form.action_type as ActionType, form.value),
  };

  const result = isEdit.value
    ? await updateAction(props.sceneId, props.action!.id, payload)
    : await createAction(props.sceneId, payload);

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

.action-field-warning {
  margin: var(--app-space-1) 0 0;
  padding-left: var(--app-space-1);
  font-size: var(--app-font-size-caption);
  color: var(--ion-color-warning-shade);
}

.action-error {
  margin-top: var(--app-space-4);
  font-size: var(--app-font-size-body-sm);
  color: var(--ion-color-danger);
}
</style>
