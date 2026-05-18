<template>
  <ion-page class="tab-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar tab-toolbar">
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

          <div class="vibe-cover-block ion-padding-start ion-padding-end">
            <p class="vibe-cover-block__label">Cover visuals</p>
            <ion-button
              expand="block"
              fill="outline"
              type="button"
              class="vibe-cover-block__btn"
              :disabled="loading"
              @click="coverPickerOpen = true"
            >
              Choose cover
            </ion-button>
            <div class="vibe-cover-preview-row" aria-hidden="true">
              <div
                class="vibe-cover-preview-row__card app-artwork-card-enter"
                :style="cardThumbStyle"
              />
              <div class="vibe-cover-preview-row__art">
                <img
                  v-if="artworkPreviewSrc"
                  :src="artworkPreviewSrc"
                  alt=""
                  class="app-artwork-fade-in"
                />
              </div>
              <div class="vibe-cover-preview-row__player" :style="playerThumbStyle" />
            </div>
            <p class="vibe-cover-block__hint">
              Card · artwork · player strip previews. Bundle applies only non-empty image URLs.
            </p>
          </div>

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

      <CoverBundlePickerModal v-model:is-open="coverPickerOpen" @apply="onCoverApplied" />
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CoverBundlePickerModal from '@/components/CoverBundlePickerModal.vue';
import { useVibes } from '@/composables/useVibes';
import type { CoverBundle } from '@/types/cover-bundle';
import { applyCoverBundleToFormFields } from '@/utils/cover-bundle-apply';
import {
  getVibeArtworkUrl,
  getVibeCardBackgroundStyle,
  getVibePlayerBackgroundStyle,
} from '@/utils/artwork';
import { vibePreviewFromImageFields } from '@/utils/vibe-form-preview';

const route = useRoute();
const router = useRouter();
const { loading, error, selectedVibe, fetchVibe, updateVibe } = useVibes();

const coverPickerOpen = ref(false);

const form = reactive({
  name: '',
  description: '',
  is_active: true,
  thumbnail_url: '',
  artwork_url: '',
  player_background_url: '',
});

const vibeDraftPreview = computed(() =>
  vibePreviewFromImageFields({
    thumbnail_url: form.thumbnail_url,
    artwork_url: form.artwork_url,
    player_background_url: form.player_background_url,
  }),
);

const cardThumbStyle = computed(() => ({
  ...getVibeCardBackgroundStyle(vibeDraftPreview.value, 0),
  width: '88px',
  height: '88px',
  borderRadius: '12px',
  flexShrink: 0,
}));

const playerThumbStyle = computed(() => ({
  ...getVibePlayerBackgroundStyle(vibeDraftPreview.value),
  width: '40px',
  height: '88px',
  borderRadius: '10px',
  flexShrink: 0,
}));

const artworkPreviewSrc = computed(() => getVibeArtworkUrl(vibeDraftPreview.value) ?? '');

onMounted(async () => {
  await fetchVibe(Number(route.params.id));
  if (error.value) {
    router.back();
  }
});

watch(selectedVibe, (vibe) => {
  if (vibe) {
    form.name = vibe.name;
    form.description = vibe.description ?? '';
    form.is_active = vibe.is_active;
    form.thumbnail_url = vibe.thumbnail_url ?? '';
    form.artwork_url = vibe.artwork_url ?? '';
    form.player_background_url = vibe.player_background_url ?? '';
  }
});

function onCoverApplied(bundle: CoverBundle): void {
  applyCoverBundleToFormFields(form, bundle);
}

async function handleSubmit() {
  const updated = await updateVibe(Number(route.params.id), {
    name: form.name.trim(),
    description: form.description.trim() || null,
    is_active: form.is_active,
    thumbnail_url: form.thumbnail_url.trim() || null,
    artwork_url: form.artwork_url.trim() || null,
    player_background_url: form.player_background_url.trim() || null,
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

.vibe-cover-block__label {
  margin: 0 0 var(--app-space-2);
  font-size: var(--app-font-size-caption);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vibe-cover-block__btn {
  margin-bottom: var(--app-space-3);
}

.vibe-cover-preview-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--app-space-3);
}

.vibe-cover-preview-row__art {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-color-surface-subtle);
}

.vibe-cover-preview-row__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.vibe-cover-block__hint {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-size-caption);
  color: var(--app-color-text-tertiary);
  line-height: 1.35;
}
</style>
