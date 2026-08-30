<template>
  <ion-page class="tab-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" class="auth-back-icon" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">New Scene</ion-title>
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
              placeholder="e.g. Movie Night"
              :disabled="loading"
              required
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-textarea
              v-model="form.description"
              label="Description"
              label-placement="floating"
              placeholder="Describe this scene..."
              :rows="3"
              :disabled="loading"
            />
          </ion-item>

          <p v-if="error" class="auth-error">{{ error }}</p>

          <ion-button
            type="submit"
            expand="block"
            class="auth-submit"
            :disabled="loading || !form.name.trim()"
          >
            <ion-spinner v-if="loading" name="crescent" />
            <span v-else>Create Scene</span>
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
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline } from 'ionicons/icons';
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useScenes } from '@/composables/useScenes';

const router = useRouter();
const { loading, error, createScene } = useScenes();

const form = reactive({
  name: '',
  description: '',
});

async function handleSubmit(): Promise<void> {
  const scene = await createScene({
    name: form.name.trim(),
    description: form.description.trim() || null,
  });

  if (scene) {
    await router.replace('/scenes');
  }
}
</script>
