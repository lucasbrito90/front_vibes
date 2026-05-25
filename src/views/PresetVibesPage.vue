<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Preset vibes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="presets-content page-shell">
        <p class="presets-intro">
          Browse curated mixes from Ixora. Import one to add an editable copy to My Vibes.
        </p>

        <AppLoadingState
          v-if="loading && !presets.length"
          class="presets-state-slot"
          compact
          title="Loading presets…"
        />

        <AppErrorState
          v-else-if="error && !presets.length"
          class="presets-state-slot"
          compact
          title="Couldn’t load presets"
          :description="error ?? ''"
          retry-label="Retry"
          @retry="fetchPresets"
        />

        <AppEmptyState
          v-else-if="!presets.length"
          class="presets-state-slot"
          variant="card"
          :icon="albumsOutline"
          title="No presets yet"
          description="When new templates are published, they’ll appear here."
        />

        <div v-else class="presets-list">
          <div
            v-for="(preset, i) in presets"
            :key="preset.id"
            class="preset-card app-card-enter app-pressable"
            :class="{
              'preset-card--has-image': !!getVibeCardImageUrl(presetForCardArtwork(preset)),
              'preset-card--fallback': !getVibeCardImageUrl(presetForCardArtwork(preset)),
            }"
            :style="getVibeCardBackgroundStyle(presetForCardArtwork(preset), i)"
            @click="router.push(`/presets/${preset.id}`)"
          >
            <div
              v-if="getVibeCardImageUrl(presetForCardArtwork(preset))"
              class="preset-card-scrim"
              aria-hidden="true"
            />
            <div v-else class="preset-card-fallback-decor" aria-hidden="true">
              <span class="preset-card-monogram">{{ nameMonogram(preset.name) }}</span>
              <ion-icon :icon="albumsOutline" class="preset-card-fallback-icon" />
            </div>
            <div class="preset-card-overlay" />

            <div class="preset-card-top-row">
              <div class="preset-card-badge preset-badge-template">Template</div>
              <div v-if="preset.layers.length" class="preset-card-badge preset-badge-layers">
                {{ preset.layers.length }} layers
              </div>
            </div>

            <div class="preset-card-bottom">
              <div class="preset-card-text">
                <span class="preset-card-name">{{ preset.name }}</span>
                <span v-if="preset.description" class="preset-card-desc">
                  {{ preset.description }}
                </span>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="preset-card-chevron" />
            </div>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue';
import { albumsOutline, chevronForwardOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { usePresetVibes } from '@/composables/usePresetVibes';
import { presetForCardArtwork } from '@/utils/preset-artwork';
import { getVibeCardBackgroundStyle, getVibeCardImageUrl } from '@/utils/artwork';

const router = useRouter();
const { presets, loading, error, fetchPresets } = usePresetVibes();

onIonViewWillEnter(() => {
  void fetchPresets();
});

function nameMonogram(name: string): string {
  const t = name.trim();

  return t ? t.charAt(0).toUpperCase() : '?';
}
</script>

<style scoped>
.presets-content {
  padding-top: var(--app-space-2);
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
}

.presets-intro {
  margin: 0 0 var(--app-space-4);
  font-size: 14px;
  line-height: 1.5;
  color: var(--app-color-text-muted, #64748b);
}

.presets-state-slot {
  margin-top: var(--app-space-6);
}

.presets-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preset-card {
  position: relative;
  width: 100%;
  height: 176px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
}

.preset-card-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.05) 42%,
    rgba(0, 0, 0, 0.02) 58%,
    rgba(0, 0, 0, 0.68) 100%
  );
}

.preset-card-fallback-decor {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.preset-card-monogram {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.15);
}

.preset-card-fallback-icon {
  position: absolute;
  bottom: 88px;
  right: 14px;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.14);
}

.preset-card-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  z-index: 1;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 0 0 12px 12px;
}

.preset-card--has-image .preset-card-overlay {
  background: rgba(15, 23, 42, 0.42);
}

.preset-card-top-row {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  z-index: 2;
}

.preset-card-badge {
  height: 24px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  border-radius: 20px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.preset-badge-template {
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(96, 165, 250, 0.45);
  color: #93c5fd;
}

.preset-badge-layers {
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.38);
  color: rgba(255, 255, 255, 0.94);
}

.preset-card-bottom {
  position: absolute;
  left: 16px;
  right: 14px;
  bottom: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  z-index: 2;
}

.preset-card-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.preset-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.2px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);
}

.preset-card-desc {
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.78);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-card-chevron {
  flex-shrink: 0;
  font-size: 22px;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 2px;
}
</style>
