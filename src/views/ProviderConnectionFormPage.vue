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
            Connect your Home Assistant instance. Your access token is stored securely on the
            server and is never shown again after saving.
          </p>

          <ion-item class="auth-item" lines="none">
            <ion-select
              v-model="form.provider"
              label="Provider"
              label-placement="floating"
              :disabled="submitting"
            >
              <ion-select-option value="home_assistant">Home Assistant</ion-select-option>
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

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.baseUrl"
              type="url"
              inputmode="url"
              label="Base URL (HTTPS)"
              label-placement="floating"
              placeholder="https://ha.example.com:8123"
              :disabled="submitting"
              required
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.accessToken"
              type="password"
              label="Long-lived access token"
              label-placement="floating"
              placeholder="Paste token"
              autocomplete="off"
              :disabled="submitting"
              required
            />
          </ion-item>

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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProviderConnections } from '@/composables/useProviderConnections';
import {
  DEVICE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
  type ProviderSlug,
} from '@/services/provider-connection.service';

const router = useRouter();
const { createConnection } = useProviderConnections();

const offline = ref(isDeviceOffline());
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const showToast = ref(false);
const toastMessage = ref('');

const form = reactive<{
  provider: ProviderSlug;
  name: string;
  baseUrl: string;
  accessToken: string;
}>({
  provider: 'home_assistant',
  name: '',
  baseUrl: '',
  accessToken: '',
});

const canSubmit = computed(
  () =>
    form.name.trim().length > 0 &&
    form.baseUrl.trim().length > 0 &&
    form.accessToken.trim().length > 0,
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
    config: { base_url: form.baseUrl.trim() },
    encrypted_credentials: { access_token: form.accessToken },
  });

  // Clear the token from memory regardless of outcome — it is write-only and
  // must never be retained on the client after submit.
  form.accessToken = '';

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
