<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="settings-ion-content">
      <div class="page-shell page-content settings-wrap">
        <!-- Audio -->
        <section class="settings-block">
          <h2 class="settings-heading">Audio</h2>
          <div class="app-surface-card settings-card">
            <button
              type="button"
              class="settings-tile"
              :disabled="!cacheInfo.hasCacheSupport || isClearingCache || isPlaybackActive"
              @click="handleClearCacheTap"
            >
              <div class="settings-tile-left">
                <div class="settings-icon-wrap">
                  <ion-icon :icon="musicalNotesOutline" />
                </div>
                <div class="settings-tile-text">
                  <span class="settings-tile-title">Clear streaming cache</span>
                  <span class="settings-tile-sub">{{ cacheSubtitle }}</span>
                </div>
              </div>
              <ion-spinner v-if="isClearingCache" name="crescent" class="settings-tile-spinner" />
              <ion-icon v-else :icon="chevronForwardOutline" class="settings-tile-chevron" />
            </button>
          </div>
          <p class="settings-hint">
            Clears ExoPlayer’s temporary disk cache (about 100 MB). Offline files you downloaded from the player menu are kept until you remove them or reinstall the app.
          </p>
        </section>

        <!-- Offline -->
        <section class="settings-block">
          <h2 class="settings-heading">Offline</h2>
          <div class="app-surface-card settings-card settings-card--static">
            <div class="settings-tile settings-tile--static">
              <div class="settings-tile-left">
                <div class="settings-icon-wrap settings-icon-wrap--muted">
                  <ion-icon :icon="cloudDownloadOutline" />
                </div>
                <div class="settings-tile-text">
                  <span class="settings-tile-title">Downloaded vibes</span>
                  <span class="settings-tile-sub">
                    Use <strong>Download for offline</strong> in the player menu (⋮). Metadata is saved so you can reopen the vibe without the network.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Appearance -->
        <section class="settings-block">
          <h2 class="settings-heading">Appearance</h2>
          <div class="app-surface-card settings-card settings-card--static settings-appearance-card">
            <ion-radio-group :value="themeMode" @ionChange="handleThemeChange">
              <ion-item lines="full" class="settings-appearance-item">
                <ion-label class="settings-appearance-label">
                  <div class="settings-tile-title">System</div>
                  <div class="settings-tile-sub">Match device light or dark mode</div>
                </ion-label>
                <ion-radio slot="end" value="system" />
              </ion-item>
              <ion-item lines="full" class="settings-appearance-item">
                <ion-label class="settings-appearance-label">
                  <div class="settings-tile-title">Light</div>
                  <div class="settings-tile-sub">Always light appearance</div>
                </ion-label>
                <ion-radio slot="end" value="light" />
              </ion-item>
              <ion-item lines="none" class="settings-appearance-item">
                <ion-label class="settings-appearance-label">
                  <div class="settings-tile-title">Dark</div>
                  <div class="settings-tile-sub">Always dark appearance</div>
                </ion-label>
                <ion-radio slot="end" value="dark" />
              </ion-item>
            </ion-radio-group>
          </div>
        </section>

        <!-- Account -->
        <section class="settings-block">
          <h2 class="settings-heading">Account</h2>
          <div class="app-surface-card settings-card">
            <button type="button" class="settings-tile settings-tile--danger" @click="handleSignOut">
              <div class="settings-tile-left">
                <div class="settings-icon-wrap settings-icon-wrap--danger">
                  <ion-icon :icon="logOutOutline" />
                </div>
                <div class="settings-tile-text">
                  <span class="settings-tile-title">Sign out</span>
                  <span class="settings-tile-sub">Leave this device</span>
                </div>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="settings-tile-chevron" />
            </button>
          </div>
        </section>

        <!-- App -->
        <section class="settings-block">
          <h2 class="settings-heading">App</h2>
          <div class="app-surface-card settings-card settings-card--static">
            <div class="settings-tile settings-tile--static">
              <div class="settings-tile-left">
                <div class="settings-icon-wrap settings-icon-wrap--brand">
                  <span class="settings-brand-mark">I</span>
                </div>
                <div class="settings-tile-text">
                  <span class="settings-tile-title">Ixora</span>
                  <span class="settings-tile-sub">Ambient layers for focus, rest, and calm.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ion-alert
        :is-open="showConfirm"
        header="Clear streaming cache?"
        message="Cached streamed audio will be deleted. Offline downloads are not removed."
        :buttons="confirmButtons"
        @didDismiss="showConfirm = false"
      />

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
  IonItem,
  IonLabel,
  IonPage,
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/vue';
import {
  chevronForwardOutline,
  cloudDownloadOutline,
  logOutOutline,
  musicalNotesOutline,
} from 'ionicons/icons';
import { usePlayerStore } from '@/stores/player.store';
import { audioEngine } from '@/services/audio-engine';
import { useAuth } from '@/composables/useAuth';
import { themeMode, setThemeMode, type ThemeMode } from '@/composables/useThemeMode';

const playerStore = usePlayerStore();
const { logout } = useAuth();

const isClearingCache = ref(false);
const showConfirm     = ref(false);
const showToast       = ref(false);
const toastMessage    = ref('');

const cacheInfo = audioEngine.getCacheInfo();

const cacheSubtitle = computed(() => {
  if (!cacheInfo.hasCacheSupport) return 'Not available on this platform';
  const mb = cacheInfo.maxSizeBytes ? Math.round(cacheInfo.maxSizeBytes / (1024 * 1024)) : 0;
  return `Up to ${mb} MB · ${isClearingCache.value ? 'Clearing…' : 'Tap to free space'}`;
});

const isPlaybackActive = computed(() => playerStore.playbackState !== 'idle');

const confirmButtons = [
  { text: 'Cancel', role: 'cancel' },
  {
    text: 'Clear',
    role: 'destructive',
    handler: () => { void doClearCache(); },
  },
];

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
    showToastMessage('Streaming cache cleared.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    showToastMessage(`Could not clear cache: ${msg}`);
  } finally {
    isClearingCache.value = false;
  }
}

function showToastMessage(msg: string): void {
  toastMessage.value = msg;
  showToast.value    = true;
}

async function handleThemeChange(ev: CustomEvent<{ value: string }>): Promise<void> {
  const v = ev.detail?.value;
  if (v === 'system' || v === 'light' || v === 'dark') await setThemeMode(v as ThemeMode);
}

async function handleSignOut(): Promise<void> {
  try {
    await logout();
    window.location.replace('/sign-in-sign-up');
  } catch {
    showToastMessage('Could not sign out. Try again.');
  }
}
</script>

<style scoped>
.settings-ion-content {
  --background: var(--app-color-surface-subtle);
}

.settings-wrap {
  padding-top: var(--app-space-2);
}

.settings-block + .settings-block {
  margin-top: var(--app-space-7);
}

.settings-heading {
  margin: 0 0 var(--app-space-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-color-text-muted);
}

.settings-card--static {
  box-shadow: var(--app-shadow-soft);
}

.settings-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  width: 100%;
  padding: var(--app-space-4) var(--app-space-5);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.settings-tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-tile:not(:disabled):active {
  background: rgba(29, 172, 146, 0.06);
}

.settings-tile--static {
  cursor: default;
}

.settings-tile--static:active {
  background: transparent;
}

.settings-tile--danger:not(:disabled):active {
  background: rgba(247, 85, 85, 0.08);
}

.settings-tile-left {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-4);
  min-width: 0;
}

.settings-icon-wrap {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--app-radius-md);
  background: var(--app-color-primary-100);
  color: var(--app-color-primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.settings-icon-wrap--muted {
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-secondary);
}

.settings-icon-wrap--danger {
  background: rgba(247, 85, 85, 0.12);
  color: var(--ion-color-danger);
}

.settings-icon-wrap--brand {
  background: var(--app-gradient-primary);
  color: #fff;
  font-weight: 800;
  font-size: 18px;
}

.settings-brand-mark {
  line-height: 1;
}

.settings-tile-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.settings-tile-title {
  font-size: var(--app-font-size-body-md);
  font-weight: 600;
  color: var(--app-color-text-primary);
}

.settings-tile-sub {
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: 1.45;
}

.settings-tile-chevron {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.settings-tile-spinner {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--app-color-primary-500);
}

.settings-hint {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-muted);
  line-height: 1.5;
}

.settings-appearance-card ion-radio-group {
  width: 100%;
}

.settings-appearance-item {
  --background: transparent;
  --padding-start: var(--app-space-5);
  --padding-end: var(--app-space-5);
  --inner-padding-end: 0;
  --min-height: 72px;
}

.settings-appearance-label {
  margin: 12px 0;
}
</style>
