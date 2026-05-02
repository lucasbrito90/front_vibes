<template>
  <ion-page>
    <ion-header class="auth-header">
      <ion-toolbar class="auth-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" router-link="/vibes">
            <ion-icon :icon="chevronBackOutline" class="auth-back-icon" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">New Vibe</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="auth-screen">
        <form class="auth-form" @submit.prevent="handleSubmit">
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
            <span v-else>Create Vibe</span>
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
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useVibes } from '@/composables/useVibes';

const router = useRouter();
const { loading, error, createVibe } = useVibes();

const form = reactive({
  name: '',
  description: '',
  is_active: true,
});

async function handleSubmit() {
  const vibe = await createVibe({
    name: form.name.trim(),
    description: form.description.trim() || null,
    is_active: form.is_active,
  });

  if (vibe) {
    await router.replace('/vibes');
  }
}
</script>
