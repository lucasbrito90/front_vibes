<template>
  <ion-page class="tab-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
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

          <ion-item class="auth-item" lines="none">
            <ion-select
              v-model="sceneSelectValue"
              label="Smart Home scene"
              label-placement="floating"
              placeholder="None"
              :disabled="loading || scenesListLoading"
              interface="action-sheet"
            >
              <ion-select-option :value="NO_SCENE_SELECT_VALUE">None</ion-select-option>
              <ion-select-option v-for="scene in scenes" :key="scene.id" :value="scene.id">
                {{ scene.name }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <div
            v-if="form.scene_id != null"
            class="vibe-scene-link ion-padding-start ion-padding-end"
          >
            <ion-button
              expand="block"
              fill="clear"
              type="button"
              class="vibe-scene-link__btn"
              :disabled="loading"
              @click="router.push(`/scenes/${form.scene_id}/actions`)"
            >
              Manage scene actions
            </ion-button>
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
            <span v-else>Create Vibe</span>
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline } from 'ionicons/icons';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import CoverBundlePickerModal from '@/components/CoverBundlePickerModal.vue';
import { useScenes } from '@/composables/useScenes';
import { useVibes } from '@/composables/useVibes';
import type { CoverBundle } from '@/types/cover-bundle';
import { applyCoverBundleToFormFields } from '@/utils/cover-bundle-apply';
import {
  getVibeArtworkUrl,
  getVibeCardBackgroundStyle,
  getVibePlayerBackgroundStyle,
} from '@/utils/artwork';
import { vibePreviewFromImageFields } from '@/utils/vibe-form-preview';

const router = useRouter();
const { loading, error, createVibe } = useVibes();
const { scenes, scenesListLoading, fetchScenes } = useScenes();

/** IonSelect cannot bind null — map "None" to this sentinel. */
const NO_SCENE_SELECT_VALUE = -1;

const coverPickerOpen = ref(false);

const form = reactive({
  name: '',
  description: '',
  is_active: true,
  thumbnail_url: '',
  artwork_url: '',
  player_background_url: '',
  scene_id: null as number | null,
});

const sceneSelectValue = computed({
  get(): number {
    return form.scene_id ?? NO_SCENE_SELECT_VALUE;
  },
  set(value: number) {
    form.scene_id = value === NO_SCENE_SELECT_VALUE ? null : value;
  },
});

onMounted(() => {
  if (!scenes.value.length) {
    void fetchScenes();
  }
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

function onCoverApplied(bundle: CoverBundle): void {
  applyCoverBundleToFormFields(form, bundle);
}

async function handleSubmit() {
  const vibe = await createVibe({
    name: form.name.trim(),
    description: form.description.trim() || null,
    is_active: form.is_active,
    thumbnail_url: form.thumbnail_url.trim() || null,
    artwork_url: form.artwork_url.trim() || null,
    player_background_url: form.player_background_url.trim() || null,
    scene_id: form.scene_id,
  });

  if (vibe) {
    await router.replace('/vibes');
  }
}
</script>

<style scoped>
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

.vibe-scene-link {
  margin-top: calc(-1 * var(--app-space-2));
  margin-bottom: var(--app-space-2);
}

.vibe-scene-link__btn {
  margin: 0;
  --padding-start: 0;
  --padding-end: 0;
  font-size: var(--app-font-size-body-sm);
}
</style>
