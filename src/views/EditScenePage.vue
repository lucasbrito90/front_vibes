<template>
  <ion-page class="tab-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" class="auth-back-icon" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">Edit Scene</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="auth-screen">
        <AppLoadingState
          v-if="loading && !selectedScene"
          compact
          title="Loading scene…"
          description="Getting this scene’s details."
        />

        <AppErrorState
          v-else-if="error && !selectedScene"
          compact
          title="Couldn’t load scene"
          :description="error ?? ''"
          retry-label="Retry"
          @retry="reload"
        />

        <form v-else class="auth-form" @submit.prevent="handleSubmit">
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
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline } from 'ionicons/icons';
import { onMounted, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useScenes } from '@/composables/useScenes';

const route = useRoute();
const router = useRouter();
const { loading, error, selectedScene, fetchScene, updateScene } = useScenes();

const form = reactive({
  name: '',
  description: '',
});

onMounted(async () => {
  await fetchScene(Number(route.params.id));
  if (error.value) {
    router.back();
  }
});

async function reload(): Promise<void> {
  await fetchScene(Number(route.params.id));
}

watch(selectedScene, (scene) => {
  if (scene) {
    form.name = scene.name;
    form.description = scene.description ?? '';
  }
});

async function handleSubmit(): Promise<void> {
  const updated = await updateScene(Number(route.params.id), {
    name: form.name.trim(),
    description: form.description.trim() || null,
  });

  if (updated) {
    await router.replace('/scenes');
  }
}
</script>
