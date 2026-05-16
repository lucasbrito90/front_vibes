<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="settings-toolbar">
        <ion-title class="settings-title">Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="settings-content">

      <!-- Audio Cache Section -->
      <div class="settings-section">
        <p class="settings-section-label">Audio</p>

        <div class="settings-card">
          <div class="settings-row" @click="handleClearCacheTap">
            <div class="settings-row-left">
              <ion-icon :icon="cloudOfflineOutline" class="settings-row-icon" />
              <div class="settings-row-text">
                <span class="settings-row-title">Clear audio cache</span>
                <span class="settings-row-sub">{{ cacheSubtitle }}</span>
              </div>
            </div>
            <ion-spinner v-if="isClearingCache" name="crescent" class="settings-row-spinner" />
            <ion-icon v-else :icon="chevronForwardOutline" class="settings-row-chevron" />
          </div>
        </div>

        <p class="settings-section-hint">
          Ixora caches audio files locally (up to 100 MB) for faster playback. Clearing the cache frees space — files are re-downloaded next time you play.
        </p>
      </div>

      <!-- Confirmation alert -->
      <ion-alert
        :is-open="showConfirm"
        header="Clear audio cache?"
        message="Cached audio files will be deleted. They will be re-downloaded next time you play a vibe."
        :buttons="confirmButtons"
        @didDismiss="showConfirm = false"
      />

      <!-- Toast feedback -->
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
import { ref, computed } from 'vue';
import {
  IonAlert,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/vue';
import { chevronForwardOutline, cloudOfflineOutline } from 'ionicons/icons';
import { usePlayerStore } from '@/stores/player.store';
import { audioEngine } from '@/services/audio-engine';

const playerStore = usePlayerStore();

// ── State ─────────────────────────────────────────────────────────────────────

const isClearingCache = ref(false);
const showConfirm     = ref(false);
const showToast       = ref(false);
const toastMessage    = ref('');

// ── Computed ──────────────────────────────────────────────────────────────────

const cacheInfo = audioEngine.getCacheInfo();

const cacheSubtitle = computed(() => {
  if (!cacheInfo.hasCacheSupport) return 'Not available on this platform';
  const mb = cacheInfo.maxSizeBytes ? Math.round(cacheInfo.maxSizeBytes / (1024 * 1024)) : 0;
  return `Up to ${mb} MB · ${isClearingCache.value ? 'Clearing…' : 'Tap to free space'}`;
});

const isPlaybackActive = computed(() => playerStore.playbackState !== 'idle');

// ── Alert buttons ─────────────────────────────────────────────────────────────

const confirmButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
  },
  {
    text: 'Clear',
    role: 'destructive',
    handler: () => { void doClearCache(); },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleClearCacheTap(): void {
  if (!cacheInfo.hasCacheSupport || isClearingCache.value) return;
  if (isPlaybackActive.value) {
    showToastMessage('Stop playback before clearing cache.');
    return;
  }
  showConfirm.value = true;
}

async function doClearCache(): Promise<void> {
  isClearingCache.value = true;
  try {
    await playerStore.clearAudioCache();
    showToastMessage('Audio cache cleared.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    showToastMessage(`Failed to clear cache: ${msg}`);
  } finally {
    isClearingCache.value = false;
  }
}

function showToastMessage(msg: string): void {
  toastMessage.value = msg;
  showToast.value    = true;
}
</script>

<style scoped>
.settings-toolbar {
  --background: var(--app-color-bg, #0f172a);
  --border-style: none;
  padding-top: 4px;
}

.settings-title {
  font-size: var(--app-font-size-h6, 18px);
  font-weight: var(--app-font-weight-bold, 700);
  color: var(--app-color-text-primary, #f1f5f9);
}

.settings-content {
  --background: var(--app-color-bg, #0f172a);
}

/* ── Section ── */

.settings-section {
  padding: 28px 16px 0;
}

.settings-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-color-text-secondary, #94a3b8);
  margin: 0 0 8px 4px;
}

.settings-section-hint {
  font-size: 12px;
  color: var(--app-color-text-secondary, #94a3b8);
  margin: 8px 4px 0;
  line-height: 1.5;
}

/* ── Card ── */

.settings-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

/* ── Row ── */

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  gap: 12px;
  transition: background 0.15s;
}

.settings-row:active {
  background: rgba(255, 255, 255, 0.04);
}

.settings-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.settings-row-icon {
  font-size: 20px;
  color: var(--app-color-text-secondary, #94a3b8);
  flex-shrink: 0;
}

.settings-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-row-title {
  font-size: var(--app-font-size-body-md, 14px);
  font-weight: 500;
  color: var(--app-color-text-primary, #f1f5f9);
}

.settings-row-sub {
  font-size: 12px;
  color: var(--app-color-text-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-row-chevron {
  font-size: 16px;
  color: rgba(148, 163, 184, 0.4);
  flex-shrink: 0;
}

.settings-row-spinner {
  --color: var(--app-color-text-secondary, #94a3b8);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
</style>
