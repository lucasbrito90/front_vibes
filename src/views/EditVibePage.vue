<template>
  <ion-page>
    <ion-header class="auth-header">
      <ion-toolbar class="auth-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" class="auth-back-icon" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">Edit Vibe</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="auth-screen">
        <div v-if="loading && !selectedVibe" class="vibes-state">
          <ion-spinner name="crescent" />
        </div>

        <div v-else-if="error && !selectedVibe" class="vibes-state">
          <p class="vibes-error">{{ error }}</p>
        </div>

        <form v-else class="auth-form" @submit.prevent="handleSubmit">
          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.name"
              label="Name"
              label-placement="floating"
              placeholder="e.g. Sleep with Rain"
              :disabled="loading"
              required
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-textarea
              v-model="form.description"
              label="Description"
              label-placement="floating"
              placeholder="Describe this vibe..."
              :rows="3"
              :disabled="loading"
            />
          </ion-item>

          <ion-item class="auth-item vibe-toggle-item" lines="none">
            <ion-label>Active</ion-label>
            <ion-toggle v-model="form.is_active" slot="end" :disabled="loading" />
          </ion-item>

          <p v-if="error" class="auth-error">{{ error }}</p>

          <ion-button
            type="submit"
            expand="block"
            class="auth-submit"
            :disabled="loading || !form.name.trim()"
          >
            <ion-spinner v-if="loading" name="crescent" />
            <span v-else>Save Changes</span>
          </ion-button>
        </form>
      </div>
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
  IonLabel,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline } from 'ionicons/icons';
import { onMounted, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useVibes } from '@/composables/useVibes';

const route = useRoute();
const router = useRouter();
const { loading, error, selectedVibe, fetchVibe, updateVibe } = useVibes();

const form = reactive({
  name: '',
  description: '',
  is_active: true,
});

onMounted(() => fetchVibe(Number(route.params.id)));

watch(selectedVibe, (vibe) => {
  if (vibe) {
    form.name = vibe.name;
    form.description = vibe.description ?? '';
    form.is_active = vibe.is_active;
  }
});

async function handleSubmit() {
  const updated = await updateVibe(Number(route.params.id), {
    name: form.name.trim(),
    description: form.description.trim() || null,
    is_active: form.is_active,
  });

  if (updated) {
    await router.replace('/vibes');
  }
}
</script>

<style scoped>
.vibes-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-4);
  padding: var(--app-space-12) var(--app-space-6);
  text-align: center;
}

.vibes-error {
  font-size: var(--app-font-size-body-md);
  color: var(--ion-color-danger);
  margin: 0;
}
</style>
