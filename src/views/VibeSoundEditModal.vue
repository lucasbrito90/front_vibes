<template>
  <ion-page class="modal-page">
    <!-- Sheet handle -->
    <div class="modal-handle-bar" />

    <!-- ion-content scrollable so footer buttons are always reachable in sheet modal -->
    <ion-content class="modal-content">
      <!-- Sound identity -->
      <div class="modal-sound-header">
        <div class="modal-thumb-wrap">
          <img
            v-if="vibeSound.thumbnail_url"
            :src="vibeSound.thumbnail_url"
            :alt="vibeSound.name"
            class="modal-thumb"
          />
          <div v-else class="modal-thumb-placeholder" />
        </div>
        <div class="modal-sound-info">
          <h3 class="modal-sound-name">{{ vibeSound.name }}</h3>
          <p class="modal-sound-category">{{ vibeSound.category }}</p>
        </div>
      </div>

      <!-- Divider -->
      <div class="modal-divider" />

      <!-- Volume -->
      <div class="modal-section">
        <div class="modal-section-header">
          <span class="modal-section-label">Volume</span>
          <span class="modal-section-value">{{ localVolume }}%</span>
        </div>

        <ion-range
          :value="localVolume"
          :min="0"
          :max="100"
          :step="1"
          color="primary"
          class="modal-range"
          @ionInput="localVolume = Number(($event as CustomEvent).detail.value)"
        >
          <ion-icon slot="start" :icon="volumeLowOutline" class="modal-range-icon" />
          <ion-icon slot="end" :icon="volumeHighOutline" class="modal-range-icon" />
        </ion-range>
      </div>

      <!-- Loop -->
      <div class="modal-section modal-section-row">
        <div class="modal-section-text">
          <p class="modal-section-label">Loop</p>
          <p class="modal-section-hint">Repeat this sound continuously</p>
        </div>
        <ion-toggle
          :checked="localLoop"
          color="primary"
          @ionChange="localLoop = ($event as CustomEvent).detail.checked"
        />
      </div>

      <!-- Sort order — read-only indicator for now -->
      <div class="modal-section modal-section-row modal-section-muted">
        <div class="modal-section-text">
          <p class="modal-section-label">Order</p>
          <p class="modal-section-hint">Position in the vibe</p>
        </div>
        <span class="modal-order-badge">{{ vibeSound.sort_order + 1 }}</span>
      </div>

      <!-- Error (shown above buttons) -->
      <p v-if="saveError" class="modal-error">{{ saveError }}</p>

      <!-- Footer inside ion-content — guarantees visibility in sheet modal -->
      <div class="modal-footer">
        <ion-button
          expand="block"
          class="modal-save-btn"
          :disabled="saving"
          @click="handleSave"
        >
          <ion-spinner
            v-if="saving"
            name="crescent"
            slot="start"
            style="width: 16px; height: 16px"
          />
          <ion-icon v-else :icon="checkmarkOutline" slot="start" />
          {{ saving ? 'Saving…' : 'Save Changes' }}
        </ion-button>

        <ion-button
          expand="block"
          fill="clear"
          class="modal-cancel-btn"
          :disabled="saving"
          @click="dismiss()"
        >
          Cancel
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  IonRange,
  IonSpinner,
  IonToggle,
  modalController,
} from '@ionic/vue';
import {
  checkmarkOutline,
  volumeHighOutline,
  volumeLowOutline,
} from 'ionicons/icons';
import { ref } from 'vue';
import { vibeSoundService, type VibeSound } from '@/services/vibe-sound.service';

const props = defineProps<{
  vibeId: number;
  vibeSound: VibeSound;
}>();

const localVolume = ref(props.vibeSound.volume ?? 80);
const localLoop = ref(props.vibeSound.loop ?? true);
const saving = ref(false);
const saveError = ref<string | null>(null);

async function dismiss(data?: { updated?: VibeSound }): Promise<void> {
  await modalController.dismiss(data ?? null);
}

async function handleSave(): Promise<void> {
  saving.value = true;
  saveError.value = null;

  try {
    const updated = await vibeSoundService.updateVibeSound(props.vibeId, props.vibeSound.id, {
      volume: localVolume.value,
      loop: localLoop.value,
    });

    await dismiss({ updated });
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save. Please try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.modal-page {
  --background: var(--app-color-bg, #fff);
}

/* ── Sheet handle ────────────────────────────────── */
.modal-handle-bar {
  width: 36px;
  height: 4px;
  background: var(--app-color-border, #e2e8f0);
  border-radius: 2px;
  margin: 12px auto 0;
  flex-shrink: 0;
}

/* ── Sound header ────────────────────────────────── */
.modal-sound-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 20px 16px;
}

.modal-thumb-wrap {
  flex-shrink: 0;
}

.modal-thumb {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  object-fit: cover;
  display: block;
}

.modal-thumb-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1dac92 0%, #0e7490 100%);
}

.modal-sound-info {
  flex: 1;
  min-width: 0;
}

.modal-sound-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-color-text-primary, #0f172a);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-sound-category {
  font-size: 13px;
  color: var(--app-color-text-muted, #94a3b8);
  margin: 0;
}

/* ── Divider ─────────────────────────────────────── */
.modal-divider {
  height: 1px;
  background: var(--app-color-border, #e2e8f0);
  margin: 0 20px;
}

/* ── Sections ────────────────────────────────────── */
.modal-section {
  padding: 20px 20px 0;
}

.modal-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--app-color-border, #e2e8f0);
  margin: 0 20px;
  padding: 18px 0;
}

.modal-section-muted {
  opacity: 0.6;
}

.modal-section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.modal-section-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-color-text-primary, #0f172a);
  margin: 0;
}

.modal-section-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--ion-color-primary, #1dac92);
}

.modal-section-text {
  flex: 1;
  min-width: 0;
}

.modal-section-hint {
  font-size: 12px;
  color: var(--app-color-text-muted, #94a3b8);
  margin: 3px 0 0;
}

/* ── Range ───────────────────────────────────────── */
.modal-range {
  --bar-height: 4px;
  --knob-size: 22px;
  --bar-background: var(--app-color-border, #e2e8f0);
  --bar-background-active: var(--ion-color-primary, #1dac92);
  --knob-background: var(--ion-color-primary, #1dac92);
  padding: 8px 0 4px;
}

.modal-range-icon {
  font-size: 18px;
  color: var(--app-color-text-muted, #94a3b8);
}

/* ── Order badge ─────────────────────────────────── */
.modal-order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--app-color-surface, #f1f5f9);
  font-size: 14px;
  font-weight: 700;
  color: var(--app-color-text-secondary, #475569);
}

/* ── Error ───────────────────────────────────────── */
.modal-error {
  font-size: 13px;
  color: var(--ion-color-danger);
  text-align: center;
  margin: 16px 20px 0;
}

/* ── Footer ──────────────────────────────────────── */
.modal-footer {
  padding: 16px 20px calc(16px + var(--ion-safe-area-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-save-btn {
  --background: var(--ion-color-primary, #1dac92);
  --border-radius: 14px;
  --padding-top: 16px;
  --padding-bottom: 16px;
  font-weight: 700;
  font-size: 16px;
}

.modal-cancel-btn {
  --color: var(--app-color-text-muted, #94a3b8);
  font-size: 15px;
  font-weight: 500;
  height: 40px;
}
</style>
