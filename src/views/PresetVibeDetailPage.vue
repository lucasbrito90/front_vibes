<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/presets" text="Presets" />
        </ion-buttons>
        <ion-title>{{ preset?.name ?? 'Preset' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="detail-shell page-shell">
        <AppLoadingState v-if="loading && !preset" compact title="Loading…" />

        <AppErrorState
          v-else-if="error && !preset"
          compact
          title="Couldn’t load preset"
          :description="error ?? ''"
          retry-label="Retry"
          @retry="load"
        />

        <template v-else-if="preset">
          <div
            class="detail-hero"
            :style="getVibeCardBackgroundStyle(presetForCardArtwork(preset), 0)"
          >
            <div class="detail-hero-scrim" aria-hidden="true" />
            <div class="detail-hero-inner">
              <span class="detail-badge">Template</span>
              <h1 class="detail-title">{{ preset.name }}</h1>
              <p v-if="preset.description" class="detail-desc">{{ preset.description }}</p>
              <p v-if="preset.category" class="detail-meta">Category · {{ preset.category }}</p>
            </div>
          </div>

          <section class="detail-section">
            <h2 class="detail-section-title">Sound layers</h2>
            <p v-if="!sortedLayers.length" class="detail-empty">
              This preset has no layers yet — you can still import it and add sounds later.
            </p>
            <ion-list v-else lines="none" class="detail-layer-list">
              <ion-item
                v-for="layer in sortedLayers"
                :key="`${layer.id}-${layer.sound_id}`"
                class="detail-layer-item"
              >
                <ion-label>
                  <div class="layer-title">{{ layer.soundName ?? `Sound #${layer.sound_id}` }}</div>
                  <div class="layer-sub">
                    {{ layer.play_mode }} · vol {{ layer.volume }} · order {{ layer.sort_order }}
                  </div>
                </ion-label>
              </ion-item>
            </ion-list>
          </section>

          <p v-if="importError" class="detail-import-error">{{ importError }}</p>
        </template>
      </div>
    </ion-content>

    <ion-footer v-if="preset" class="ion-no-border detail-footer">
      <ion-toolbar class="detail-footer-toolbar">
        <ion-button
          expand="block"
          color="primary"
          class="detail-import-btn"
          :disabled="importing"
          @click="handleImport"
        >
          <ion-spinner v-if="importing" slot="start" name="crescent" />
          {{ importing ? 'Importing…' : 'Import to My Vibes' }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  toastController,
} from '@ionic/vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { usePresetVibes } from '@/composables/usePresetVibes';
import { useVibes } from '@/composables/useVibes';
import { presetVibeService } from '@/services/preset-vibe.service';
import { presetForCardArtwork } from '@/utils/preset-artwork';
import { getVibeCardBackgroundStyle } from '@/utils/artwork';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));

const { selected: preset, loading, error, fetchPreset } = usePresetVibes();
const { fetchVibes } = useVibes();

const importing = ref(false);
const importError = ref<string | null>(null);

const sortedLayers = computed(() => {
  const p = preset.value;
  if (!p) return [];

  return [...p.layers].sort((a, b) => a.sort_order - b.sort_order || a.sound_id - b.sound_id);
});

async function load(): Promise<void> {
  importError.value = null;
  if (!Number.isFinite(id.value)) return;
  await fetchPreset(id.value);
}

watch(id, () => {
  void load();
});

onIonViewWillEnter(() => {
  void load();
});

async function handleImport(): Promise<void> {
  const p = preset.value;
  if (!p || importing.value) return;

  importing.value = true;
  importError.value = null;

  try {
    await presetVibeService.importPresetVibe(p.id);
    await fetchVibes();

    const toast = await toastController.create({
      message: `"${p.name}" added to My Vibes.`,
      duration: 2800,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();

    router.push('/vibes');
  } catch (err) {
    importError.value =
      err instanceof Error ? err.message : 'Import failed. Please try again.';
    const toast = await toastController.create({
      message: importError.value,
      duration: 4000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.detail-shell {
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.detail-hero {
  position: relative;
  min-height: 200px;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: var(--app-space-5);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(15, 23, 42, 0.92) 0%,
    rgba(15, 23, 42, 0.35) 45%,
    rgba(0, 0, 0, 0.25) 100%
  );
}

.detail-hero-inner {
  position: relative;
  z-index: 1;
  padding: 20px 18px 22px;
}

.detail-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  background: rgba(59, 130, 246, 0.28);
  border: 1px solid rgba(96, 165, 250, 0.5);
  color: #bfdbfe;
  margin-bottom: 12px;
}

.detail-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  line-height: 1.25;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
}

.detail-desc {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.88);
}

.detail-meta {
  margin: 12px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.detail-section-title {
  margin: 0 0 var(--app-space-3);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--app-color-text-muted, #64748b);
}

.detail-empty {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--app-color-text-muted, #64748b);
}

.detail-layer-list {
  background: transparent;
  padding: 0;
}

.detail-layer-item {
  --background: var(--app-color-bg-elevated, #f8fafc);
  --border-radius: 12px;
  margin-bottom: 10px;
  border-radius: 12px;
  border: 1px solid var(--app-color-border, #e2e8f0);
}

.layer-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--app-color-text, #0f172a);
}

.layer-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-color-text-muted, #64748b);
}

.detail-import-error {
  margin-top: var(--app-space-4);
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
  font-size: 14px;
  line-height: 1.45;
}

.detail-footer-toolbar {
  --background: var(--app-color-bg, #ffffff);
  --padding-top: 8px;
  --padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  --padding-start: 16px;
  --padding-end: 16px;
  border-top: 1px solid var(--app-color-border, #e2e8f0);
}

.detail-import-btn {
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
