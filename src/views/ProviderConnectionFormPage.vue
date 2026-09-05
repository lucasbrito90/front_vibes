<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Add connection</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="auth-screen provider-form-screen page-shell">
        <form class="auth-form" @submit.prevent="handleSubmit">
          <div v-if="offline" class="provider-form-offline" role="status">
            <ion-icon :icon="cloudOfflineOutline" />
            <span>{{ DEVICE_OFFLINE_MUTATION_MESSAGE }}</span>
          </div>

          <p class="provider-form-hint">
            Connect your
            {{ selectedProviderType?.label ?? 'smart home provider' }}. Your credentials are
            stored securely on the server and are never shown again after saving.
          </p>

          <ion-item class="auth-item" lines="none">
            <ion-select
              v-model="form.provider"
              label="Provider"
              label-placement="floating"
              :disabled="submitting || typesLoading"
              @ion-change="onProviderChange"
            >
              <ion-select-option
                v-for="pt in providerTypes"
                :key="pt.slug"
                :value="pt.slug"
              >
                {{ pt.label }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.name"
              label="Name"
              label-placement="floating"
              placeholder="e.g. Home HA"
              :disabled="submitting"
              required
            />
          </ion-item>

          <!-- Dynamic config fields from the selected provider type schema -->
          <template v-if="selectedProviderType">
            <ion-item
              v-for="(schema, key) in selectedProviderType.config"
              :key="`config-${key}`"
              class="auth-item"
              lines="none"
            >
              <ion-input
                v-model="configValues[key]"
                :type="fieldInputType(schema)"
                :inputmode="fieldInputMode(schema)"
                :label="fieldLabel(key)"
                label-placement="floating"
                :placeholder="fieldPlaceholder(key, schema)"
                :disabled="submitting"
                :required="schema.required"
              />
            </ion-item>

            <!-- Dynamic credential fields — always rendered as password -->
            <ion-item
              v-for="(schema, key) in selectedProviderType.credentials"
              :key="`cred-${key}`"
              class="auth-item"
              lines="none"
            >
              <ion-input
                v-model="credentialValues[key]"
                type="password"
                :label="fieldLabel(key)"
                label-placement="floating"
                :placeholder="`Paste ${fieldLabel(key).toLowerCase()}`"
                autocomplete="off"
                :disabled="submitting"
                :required="schema.required"
              />
            </ion-item>
          </template>

          <p v-if="errorMessage" class="provider-form-error" role="alert">{{ errorMessage }}</p>

          <ion-button
            type="submit"
            expand="block"
            class="provider-form-submit"
            :disabled="submitting || offline || !canSubmit"
          >
            <ion-spinner v-if="submitting" name="crescent" />
            <span v-else>Save connection</span>
          </ion-button>
        </form>
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
  IonToast,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline, cloudOfflineOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProviderConnections } from '@/composables/useProviderConnections';
import { useProviderTypes } from '@/composables/useProviderTypes';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
  type ProviderFieldSchema,
} from '@/services/provider-connection.service';

const router = useRouter();
const { createConnection } = useProviderConnections();
const { providerTypes, loading: typesLoading, fetchProviderTypes } = useProviderTypes();

const offline = ref(isDeviceOffline());
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const showToast = ref(false);
const toastMessage = ref('');

const form = reactive<{
  provider: string;
  name: string;
}>({
  provider: '',
  name: '',
});

const configValues = reactive<Record<string, string>>({});
const credentialValues = reactive<Record<string, string>>({});

const selectedProviderType = computed(() =>
  providerTypes.value.find((p) => p.slug === form.provider),
);

/** Initialise dynamic field maps whenever the selected provider changes. */
function initFieldValues(slug: string): void {
  const pt = providerTypes.value.find((p) => p.slug === slug);
  if (!pt) return;

  // Reset and populate config keys
  Object.keys(configValues).forEach((k) => delete configValues[k]);
  for (const key of Object.keys(pt.config)) {
    configValues[key] = '';
  }

  // Reset and populate credential keys
  Object.keys(credentialValues).forEach((k) => delete credentialValues[k]);
  for (const key of Object.keys(pt.credentials)) {
    credentialValues[key] = '';
  }
}

function onProviderChange(): void {
  initFieldValues(form.provider);
}

/** Set provider to first available once the list loads. */
watch(providerTypes, (types) => {
  if (types.length > 0 && !form.provider) {
    form.provider = types[0].slug;
    initFieldValues(form.provider);
  }
});

const canSubmit = computed(() => {
  if (!form.name.trim() || !form.provider) return false;
  const pt = selectedProviderType.value;
  if (!pt) return false;
  for (const [key, schema] of Object.entries(pt.config)) {
    if (schema.required && !(configValues[key] ?? '').trim()) return false;
  }
  for (const [key, schema] of Object.entries(pt.credentials)) {
    if (schema.required && !(credentialValues[key] ?? '').trim()) return false;
  }
  return true;
});

/** Map a ProviderFieldSchema to the appropriate HTML input type. */
function fieldInputType(schema: ProviderFieldSchema): 'text' | 'url' | 'password' | 'email' | 'tel' | 'number' | 'search' | 'date' | 'time' | 'datetime-local' {
  if (schema.format?.startsWith('url:')) return 'url';
  return 'text';
}

/** Map a ProviderFieldSchema to the appropriate inputmode. */
function fieldInputMode(schema: ProviderFieldSchema): 'url' | 'search' | 'text' | 'email' | 'none' | 'tel' | 'numeric' | 'decimal' | undefined {
  if (schema.format?.startsWith('url:')) return 'url';
  return 'text';
}

/** Convert a snake_case field key to a human-readable label. */
function fieldLabel(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Derive a placeholder from the field key and schema. */
function fieldPlaceholder(key: string, schema: ProviderFieldSchema): string {
  if (schema.format?.startsWith('url:')) {
    const protocol = schema.format.split(':')[1] ?? 'https';
    return `${protocol}://`;
  }
  return `Enter ${fieldLabel(key).toLowerCase()}`;
}

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

onMounted(async () => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  await fetchProviderTypes();
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

async function handleSubmit(): Promise<void> {
  updateOnlineState();
  if (offline.value) {
    notify(DEVICE_OFFLINE_MUTATION_MESSAGE);
    return;
  }
  if (!canSubmit.value) return;

  submitting.value = true;
  errorMessage.value = null;

  const connection = await createConnection({
    provider: form.provider,
    name: form.name.trim(),
    config: { ...configValues },
    encrypted_credentials: { ...credentialValues },
  });

  // Clear all credential values from memory — write-only, must not survive submit.
  for (const key of Object.keys(credentialValues)) {
    credentialValues[key] = '';
  }

  submitting.value = false;

  if (connection) {
    router.replace(`/devices/providers/${connection.id}`);
  } else {
    const { error } = useProviderConnections();
    errorMessage.value = error.value ?? 'Could not save the connection.';
  }
}
</script>

<style scoped>
.provider-form-screen {
  padding-top: var(--app-space-4);
}

.provider-form-hint {
  margin: 0 0 var(--app-space-4);
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
}

.provider-form-offline {
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

.provider-form-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.provider-form-error {
  margin: var(--app-space-3) 0 0;
  color: var(--ion-color-danger, #c0392b);
  font-size: var(--app-font-size-body-sm);
}

.provider-form-submit {
  margin-top: var(--app-space-5);
  min-height: 48px;
}
</style>
