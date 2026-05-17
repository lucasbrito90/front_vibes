<template>
  <ion-page class="player-page">
    <ion-content :fullscreen="true" class="player-content">
      <div class="player-wrap">
        <!-- Background layer (keyed for subtle enter transition on vibe / artwork change) -->
        <div
          :key="heroBgKey"
          class="player-bg"
          :class="{ 'player-bg--image': heroHasArtwork }"
          :style="heroBackground"
          aria-hidden="true"
        />

        <!-- Legibility: gradient wash + vignette -->
        <div class="player-overlay" aria-hidden="true" />
        <div class="player-overlay player-overlay--vignette" aria-hidden="true" />

        <!-- ── Header ───────────────────────────────── -->
        <header class="player-header">
          <button type="button" class="player-icon-btn" aria-label="Back" @click="handleBack">
            <ion-icon :icon="chevronBackOutline" />
          </button>
          <button
            type="button"
            class="player-icon-btn player-icon-btn--menu"
            :id="menuTriggerId"
            aria-label="Options"
          >
            <ion-icon :icon="ellipsisVertical" />
          </button>
          <ion-popover :trigger="menuTriggerId" dismiss-on-select="true">
            <ion-content class="player-menu-ion-content">
              <ion-list lines="full">
                <ion-item button :detail="false" lines="full" @click="handleRestartVibe">
                  <ion-icon :icon="refreshOutline" slot="start" class="player-menu-icon" />
                  Restart vibe
                </ion-item>
                <ion-item
                  v-if="_isNativePlatform && !vibeOfflineReady"
                  button
                  :detail="false"
                  lines="full"
                  @click="handleDownloadForOffline"
                  :disabled="isDownloading || !hasPlayableLayers"
                >
                  <ion-icon :icon="isDownloading ? cloudDoneOutline : cloudDownloadOutline" slot="start" class="player-menu-icon" />
                  {{ isDownloading ? 'Downloading…' : 'Download for offline' }}
                </ion-item>
                <ion-item
                  v-if="_isNativePlatform && vibeOfflineReady"
                  button
                  :detail="false"
                  lines="full"
                  @click="handleRemoveOfflineDownload"
                >
                  <ion-icon :icon="trashOutline" slot="start" class="player-menu-icon" />
                  Remove offline download
                </ion-item>
                <ion-item button :detail="false" lines="none" @click="handleStopVibe">
                  <ion-icon :icon="stopCircleOutline" slot="start" class="player-menu-icon" />
                  Stop vibe
                </ion-item>
              </ion-list>
            </ion-content>
          </ion-popover>
        </header>

        <!-- ── Center: Play / Pause ──────────────────── -->
        <div class="player-center">
          <div
            v-if="loading || isThisVibePreparing"
            class="player-spinner-wrap"
            :class="{ 'player-spinner-wrap--preparing': isThisVibePreparing && !loading }"
          >
            <AppLoadingState
              compact
              tone="inverse"
              :title="loading ? 'Loading vibe…' : 'Preparing playback…'"
            />
          </div>

          <button
            v-else
            type="button"
            class="player-control-btn"
            :class="{
              'player-control-btn--disabled': !canUsePlaybackControls,
              'player-control-btn--playing': isThisVibePlaying,
              'player-control-btn--paused': isThisVibePaused,
            }"
            :disabled="!canUsePlaybackControls"
            :aria-label="centerAriaLabel"
            @click="togglePlayback"
          >
            <ion-icon
              :icon="centerIcon"
              class="player-control-icon"
            />
          </button>
        </div>

        <!-- ── Bottom info panel ─────────────────────── -->
        <div class="player-bottom">
          <!-- Warning (no sounds / nothing playable) -->
          <AppErrorState
            v-if="!loading && playbackErroredThisVibe"
            tone="inverse"
            compact
            class="player-inline-state"
            title="Playback couldn’t start"
            description="Something went wrong while preparing audio."
            retry-label="Try again"
            @retry="handleRestartVibe"
          />

          <AppEmptyState
            v-else-if="!loading && offlineUnavailableAfterLoad"
            tone="inverse"
            variant="compact"
            class="player-inline-state"
            :icon="cloudOfflineOutline"
            title="This vibe is not available offline"
            description="Connect to the internet or use Download for offline from the menu when you’re online."
          />

          <p
            v-if="!loading && warningText && !playbackErroredThisVibe && !offlineUnavailableAfterLoad"
            class="player-warning player-warning--banner"
          >
            {{ warningText }}
          </p>

          <div class="player-identity">
            <p class="player-label">Ambient mix</p>
            <h1 class="player-title">{{ vibe?.name ?? '…' }}</h1>
            <p v-if="vibe?.description" class="player-desc">{{ vibe.description }}</p>
            <p class="player-sounds-text">{{ soundsSummary }}</p>
          </div>

          <div
            v-if="!loading && badgeItems.length > 0"
            class="player-badge-row"
            role="status"
            aria-label="Session indicators"
          >
            <span
              v-for="b in badgeItems"
              :key="b.key"
              class="player-badge"
              :class="`player-badge--${b.tone}`"
            >
              <ion-icon :icon="b.icon" class="player-badge__icon" aria-hidden="true" />
              {{ b.label }}
            </span>
          </div>

          <div class="player-status-row">
            <span
              class="player-status-dot"
              :class="statusDotClass"
            />
            <span class="player-status-text">{{ statusText }}</span>
          </div>

          <section
            v-if="executionPlan.length > 0 && !loading"
            class="player-layers"
            aria-label="Sound layers in this vibe"
          >
            <h2 class="player-layers-heading">Sound layers</h2>
            <ul class="player-layer-list">
              <li
                v-for="layer in executionPlan"
                :key="layer.soundId"
                class="player-layer-card"
                :class="{ 'player-layer-card--muted': !isExecutionLayerPlayable(layer) }"
              >
                <div class="player-layer-card-top">
                  <span class="player-layer-name">{{ layer.soundName }}</span>
                  <span class="player-layer-mode">{{ playModeShort(layer) }}</span>
                </div>
                <div class="player-layer-chips">
                  <span class="player-layer-chip">{{ layer.volume }}% volume</span>
                  <span
                    v-if="layer.durationSeconds != null"
                    class="player-layer-chip"
                  >
                    {{ formatDuration(layer.durationSeconds) }} clip
                  </span>
                  <span
                    v-if="layer.playMode === 'interval' && layer.repeatIntervalSeconds != null"
                    class="player-layer-chip"
                  >
                    {{ formatDuration(layer.repeatIntervalSeconds) }} apart
                  </span>
                  <span v-if="layer.startsAtSeconds > 0" class="player-layer-chip">
                    after {{ formatDuration(layer.startsAtSeconds) }}
                  </span>
                  <span v-if="layer.fadeInSeconds > 0" class="player-layer-chip">
                    fade in {{ layer.fadeInSeconds }}s
                  </span>
                  <span v-if="layer.fadeOutSeconds > 0" class="player-layer-chip">
                    fade out {{ layer.fadeOutSeconds }}s
                  </span>
                </div>
              </li>
            </ul>
          </section>

          <!-- DEV only: Player state, execution plan, and runtime logs panels -->
          <template v-if="isDev">
            <!-- Player state — visible on device without ADB -->
            <div v-if="!loading" class="player-dev-panel player-dev-panel--state">
              <div class="player-dev-panel-header">
                <span class="player-dev-badge player-dev-badge--state">STATE</span>
                <span class="player-dev-title">Player State</span>
              </div>
              <p class="player-dev-state-hint">Main player only — use the central ▶ button to test MiniPlayer.</p>
              <div class="player-dev-state-grid">
                <span class="player-dev-state-key">platform</span>
                <strong class="player-dev-state-val">{{ _isNativePlatform ? '📱 native' : '🌐 web' }}</strong>

                <span class="player-dev-state-key">routeVibeId</span>
                <strong class="player-dev-state-val">{{ vibeId }}</strong>

                <span class="player-dev-state-key">currentVibeId</span>
                <strong class="player-dev-state-val">{{ currentVibeId ?? 'null' }}</strong>

                <span class="player-dev-state-key">playbackState</span>
                <strong class="player-dev-state-val" :class="`player-dev-state--${playbackState}`">{{ playbackState }}</strong>

                <span class="player-dev-state-key">isRoutePlaying</span>
                <strong class="player-dev-state-val" :class="isThisVibePlaying ? 'player-dev-state--playing' : 'player-dev-state--idle'">{{ isThisVibePlaying }}</strong>

                <span class="player-dev-state-key">isRoutePaused</span>
                <strong class="player-dev-state-val" :class="isThisVibePaused ? 'player-dev-state--paused' : 'player-dev-state--idle'">{{ isThisVibePaused }}</strong>

                <span class="player-dev-state-key">isRoutePreparing</span>
                <strong class="player-dev-state-val" :class="isThisVibePreparing ? 'player-dev-state--playing' : 'player-dev-state--idle'">{{ isThisVibePreparing }}</strong>

                <span class="player-dev-state-key">store.hasActive</span>
                <strong class="player-dev-state-val" :class="hasActiveLayers ? 'player-dev-state--playing' : 'player-dev-state--idle'">{{ hasActiveLayers }}</strong>

                <span class="player-dev-state-key">svc.hasActive</span>
                <strong class="player-dev-state-val" :class="diagServiceLayers ? 'player-dev-state--playing' : 'player-dev-state--idle'">{{ diagServiceLayers }}</strong>

                <span class="player-dev-state-key">hideMiniPlayer</span>
                <strong class="player-dev-state-val">{{ !!route.meta.hideMiniPlayer }}</strong>

                <span class="player-dev-state-key">lastPlayVibe</span>
                <strong class="player-dev-state-val">{{ diagLastPlayResult === null ? '—' : diagLastPlayResult }}</strong>

                <span class="player-dev-state-key">plan / playable</span>
                <strong class="player-dev-state-val">{{ executionPlan.length }} / {{ playableLayers.length }}</strong>

                <span class="player-dev-state-key">offlineSnapshot</span>
                <strong class="player-dev-state-val">{{ loadedFromOfflineSnapshot }}</strong>
              </div>
            </div>

            <!-- Execution Plan -->
            <div v-if="!loading" class="player-dev-panel">
              <div class="player-dev-panel-header">
                <span class="player-dev-badge">DEV</span>
                <span class="player-dev-title">DEV Execution Plan</span>
                <span class="player-dev-count">{{ executionPlan.length }} layer{{ executionPlan.length !== 1 ? 's' : '' }}</span>
              </div>
              <div v-if="!executionPlan.length" class="player-dev-empty">No layers (build plan after load).</div>
              <div v-for="layer in executionPlan" :key="layer.soundId" class="player-dev-layer">
                <p class="player-dev-layer-summary">{{ layer.humanReadableSummary }}</p>
                <div class="player-dev-layer-meta">
                  <span>start: {{ layer.startsAtSeconds }}s</span>
                  <span v-if="layer.endsAtSeconds != null">end: {{ layer.endsAtSeconds }}s</span>
                  <span v-if="layer.repeatIntervalSeconds != null">interval: {{ layer.repeatIntervalSeconds }}s</span>
                  <span v-if="layer.fadeInSeconds">fade↑ {{ layer.fadeInSeconds }}s</span>
                  <span v-if="layer.fadeOutSeconds">fade↓ {{ layer.fadeOutSeconds }}s</span>
                  <span :class="{ 'player-dev-unplayable': !isExecutionLayerPlayable(layer) }">
                    {{ isExecutionLayerPlayable(layer) ? 'playable' : 'skipped (invalid URL or interval)' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Runtime Logs panel — in-app diagnostics without ADB -->
            <div class="player-dev-panel player-dev-panel--logs">
              <div class="player-dev-panel-header player-dev-logs-header" @click="devLogsExpanded = !devLogsExpanded">
                <span class="player-dev-badge player-dev-badge--logs">LOGS</span>
                <span class="player-dev-title">Runtime Logs</span>
                <span class="player-dev-logs-count">{{ logBuffer.length }}</span>
                <button
                  type="button"
                  class="player-dev-logs-clear"
                  @click.stop="clearLogBuffer()"
                  title="Clear logs"
                >✕</button>
                <span class="player-dev-logs-toggle">{{ devLogsExpanded ? '▲' : '▼' }}</span>
              </div>

              <div v-if="devLogsExpanded" class="player-dev-logs-list">
                <div v-if="!logBuffer.length" class="player-dev-empty">No logs yet.</div>
                <div
                  v-for="(entry, i) in logBuffer"
                  :key="i"
                  class="player-dev-log-entry"
                  :class="`player-dev-log-entry--${entry.level}`"
                >
                  <span class="player-dev-log-ts">{{ entry.ts }}</span>
                  <span class="player-dev-log-prefix">[{{ entry.prefix }}]</span>
                  <span class="player-dev-log-msg">{{ entry.message }}</span>
                  <span v-if="entry.data" class="player-dev-log-data">{{ JSON.stringify(entry.data) }}</span>
                </div>
              </div>
            </div>
          </template>

        </div>

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItem,
  IonList,
  IonPage,
  IonPopover,
  toastController,
} from '@ionic/vue';
import {
  chevronBackOutline,
  checkmarkCircleOutline,
  cloudDoneOutline,
  cloudDownloadOutline,
  cloudOfflineOutline,
  ellipsisVertical,
  pauseCircleOutline,
  pauseOutline,
  playOutline,
  pulseOutline,
  refreshOutline,
  stopCircleOutline,
  trashOutline,
} from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Capacitor } from '@capacitor/core';

import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player.store';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { useVibeSounds } from '@/composables/useVibeSounds';
import { useVibes } from '@/composables/useVibes';
import { audioPlayerService } from '@/services/audio-player.service';
import {
  getOfflineVibeSnapshot,
  offlineMetaToVibe,
  saveOfflineVibeSnapshot,
} from '@/services/offline-vibe-cache.service';
import { isVibeDownloaded, removeDownloadedVibe } from '@/services/offline-downloads.service';
import {
  formatDuration,
  isExecutionLayerPlayable,
  type VibeExecutionLayer,
} from '@/services/player-engine.service';
import { createLogger, logBuffer, clearLogBuffer } from '@/utils/player-debug';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import {
  getVibeArtworkUrl,
  getVibePlayerBackgroundUrl,
  getVibePlayerBackgroundStyle,
} from '@/utils/artwork';

// ── Route / Router ────────────────────────────────────────────────────────────

const route  = useRoute();
const router = useRouter();
const vibeId = computed(() => Number(route.params.id));

// ── Data ──────────────────────────────────────────────────────────────────────

const { vibes, selectedVibe, fetchVibe, hydrateSelectedVibeFromOffline } = useVibes();
const { vibeSounds, fetchVibeSounds, hydrateVibeSoundsFromOffline }         = useVibeSounds();
const { executionPlan, buildPlan, clearPlan } = usePlayerEngine();

const store = usePlayerStore();
const {
  playbackState,
  elapsedSeconds,
  hasActiveLayers,
  currentVibeId,
} = storeToRefs(store);

const menuTriggerId = computed(() => `vibe-player-menu-${vibeId.value}`);

const loading                   = ref(false);
const isDownloading             = ref(false);
/** Full-file download + snapshot saved — distinct from “playing from snapshot this session”. */
const vibeOfflineReady          = ref(false);
/** Offline visit without snapshot — show inline guidance (not only toast). */
const offlineUnavailableAfterLoad = ref(false);
/** True when sounds + vibe detail were restored from `offline_vibe_manifest_v1` (API had no usable sounds). */
const loadedFromOfflineSnapshot = ref(false);

// ── Logger ────────────────────────────────────────────────────────────────────

const log = createLogger('VibePlayerPage');

// ── DEV mode flag ─────────────────────────────────────────────────────────────
// Tree-shaken to `false` in production builds (vite define: import.meta.env.DEV).

const isDev = import.meta.env.DEV;

// ── DEV diagnostics ───────────────────────────────────────────────────────────
// These refs are only used by the DEV panels (visible when isDev === true).
// In production, no panels are rendered and no polling tick is started.

const _isNativePlatform = Capacitor.isNativePlatform();

/** Live value from audioPlayerService (polled at 1 Hz in DEV only). */
const diagServiceLayers = ref(false);
/** Last value returned by store.playVibe(). */
const diagLastPlayResult = ref<boolean | null>(null);

let _diagTickId: ReturnType<typeof setInterval> | null = null;

/** Controls whether the in-app DEV Logs panel is expanded. */
const devLogsExpanded = ref(true);

// Prefer the already-loaded vibe from the list; fall back to selectedVibe
const vibe = computed(() =>
  vibes.value.find((v) => v.id === vibeId.value)
  ?? (selectedVibe.value?.id === vibeId.value ? selectedVibe.value : null),
);

const heroHasArtwork = computed(() => !!getVibePlayerBackgroundUrl(vibe.value));

/** Remount background layer for a short fade-in when vibe or artwork changes. */
const heroBgKey = computed(() => {
  const v = vibe.value;
  return `${vibeId.value}-${getVibePlayerBackgroundUrl(v) ?? 'gradient'}`;
});

function playModeShort(layer: VibeExecutionLayer): string {
  switch (layer.playMode) {
    case 'loop':
      return 'Loop';
    case 'once':
      return 'Once';
    case 'interval':
      return layer.repeatIntervalSeconds != null
        ? `Every ${formatDuration(layer.repeatIntervalSeconds)}`
        : 'Interval';
    default:
      return layer.playMode;
  }
}

// ── Execution plan helpers ────────────────────────────────────────────────────

const playableLayers = computed(() => executionPlan.value.filter(isExecutionLayerPlayable));

const hasPlayableLayers = computed(() => playableLayers.value.length > 0);

async function refreshOfflineDownloadState(): Promise<void> {
  vibeOfflineReady.value = await isVibeDownloaded(vibeId.value);
}

watch(
  vibeId,
  () => {
    offlineUnavailableAfterLoad.value = false;
    void refreshOfflineDownloadState();
  },
  { immediate: true },
);

// ── Per-route playback state ──────────────────────────────────────────────────
// These compare the route's vibeId with the store's currentVibeId so the player
// UI reflects what THIS vibe is doing, not whatever might be playing globally.

/** True when this exact vibe is actively playing. */
const isThisVibePlaying = computed(
  () => currentVibeId.value === vibeId.value && playbackState.value === 'playing',
);

/** True when this exact vibe is paused. */
const isThisVibePaused = computed(
  () => currentVibeId.value === vibeId.value && playbackState.value === 'paused',
);

/** True while this vibe is waiting for the audio engine to confirm the first audible layer. */
const isThisVibePreparing = computed(
  () => currentVibeId.value === vibeId.value && playbackState.value === 'preparing',
);

/** True when a DIFFERENT vibe is currently playing or paused. */
const isAnotherVibePlaying = computed(
  () => currentVibeId.value !== null && currentVibeId.value !== vibeId.value,
);

/**
 * The center button is enabled when:
 *  - this vibe has playable sounds (can start/pause/resume), OR
 *  - this vibe is already active (pause/resume even if plan became invalid), OR
 *  - another vibe is playing (so the user can switch to this one).
 * While THIS vibe is preparing, controls stay disabled to prevent double-starts.
 */
const canUsePlaybackControls = computed(
  () =>
    !isThisVibePreparing.value
    && (
      hasPlayableLayers.value
      || isThisVibePlaying.value
      || isThisVibePaused.value
      || isAnotherVibePlaying.value
    ),
);

/** Same-route vibe playback ended in error — surfaced inline with retry. */
const playbackErroredThisVibe = computed(
  () => currentVibeId.value === vibeId.value && playbackState.value === 'error',
);

const warningText = computed((): string | null => {
  if (loading.value) return null;
  if (playbackErroredThisVibe.value) return null;
  if (offlineUnavailableAfterLoad.value) return null;
  if (isThisVibePreparing.value) return null;
  if (!vibeSounds.value.length) return 'No sounds configured';
  if (isAnotherVibePlaying.value) return 'Another vibe is playing — tap Play to switch';
  if (!hasPlayableLayers.value) return 'No playable sounds for this phase';
  return null;
});

// ── Sounds summary ────────────────────────────────────────────────────────────

const soundsSummary = computed((): string => {
  const sounds = vibeSounds.value;
  const count  = sounds.length;

  if (!count) return 'No sounds configured';

  const names = sounds.map((s) => s.name);

  if (count === 1) return `1 sound • ${names[0]}`;
  if (count <= 3)  return `${count} sounds • ${names.join(' • ')}`;

  const shown     = names.slice(0, 2).join(' • ');
  const remaining = count - 2;
  return `${count} sounds • ${shown} +${remaining}`;
});

// ── Session timer display ─────────────────────────────────────────────────────

function formatElapsed(s: number): string {
  if (s < 3600) {
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const statusText = computed((): string => {
  if (isThisVibePreparing.value) return 'Starting playback…';
  if (isThisVibePlaying.value) return `Playing • ${formatElapsed(elapsedSeconds.value)}`;
  if (isThisVibePaused.value)  return `Paused • ${formatElapsed(elapsedSeconds.value)}`;
  if (isAnotherVibePlaying.value) return 'Another vibe is playing';
  return 'Ready';
});

/** Dot reflects whether THIS vibe is playing, paused, or preparing. */
const statusDotClass = computed((): Record<string, boolean> => ({
  'player-status-dot--active': isThisVibePlaying.value,
  'player-status-dot--paused': isThisVibePaused.value,
  'player-status-dot--preparing': isThisVibePreparing.value,
}));

type PlayerBadgeTone = 'success' | 'info' | 'warn' | 'neutral';

interface PlayerBadgeItem {
  key: string;
  label: string;
  icon: string;
  tone: PlayerBadgeTone;
}

/** Discrete chips for offline context + transient playback states. */
const badgeItems = computed((): PlayerBadgeItem[] => {
  if (loading.value) return [];
  const items: PlayerBadgeItem[] = [];
  if (loadedFromOfflineSnapshot.value) {
    items.push({
      key: 'offline-mode',
      label: 'Offline mode',
      icon:  cloudOfflineOutline,
      tone:  'info',
    });
  }
  if (vibeOfflineReady.value) {
    items.push({
      key: 'available-offline',
      label: 'Available offline',
      icon:  checkmarkCircleOutline,
      tone:  'success',
    });
  }
  if (isThisVibePreparing.value) {
    items.push({
      key: 'preparing',
      label: 'Preparing',
      icon:  pulseOutline,
      tone:  'neutral',
    });
  }
  if (isThisVibePaused.value) {
    items.push({
      key: 'paused',
      label: 'Paused',
      icon:  pauseCircleOutline,
      tone:  'warn',
    });
  }
  return items;
});

const centerIcon = computed(() =>
  isThisVibePlaying.value ? pauseOutline : playOutline,
);

const centerAriaLabel = computed((): string => {
  if (isThisVibePreparing.value) return 'Starting playback';
  if (!loading.value && !canUsePlaybackControls.value) return 'Playback unavailable';
  if (isThisVibePlaying.value) return 'Pause';
  if (isThisVibePaused.value)  return 'Resume';
  return 'Play';
});

// ── Toast helper ──────────────────────────────────────────────────────────────

async function showPlaybackToast(message: string): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 2_800,
    position: 'bottom',
    color: 'medium',
  });
  await toast.present();
}

async function togglePlayback(): Promise<void> {
  log.debug('MAIN PLAYER — togglePlayback', {
    vibeId:           vibeId.value,
    currentVibeId:    currentVibeId.value,
    playbackState:    playbackState.value,
    isThisPlaying:    isThisVibePlaying.value,
    isThisPaused:     isThisVibePaused.value,
    isAnotherPlaying: isAnotherVibePlaying.value,
    loading:          loading.value,
  });

  if (loading.value || isThisVibePreparing.value) return;

  // ── Case B: this vibe is playing → pause ─────────────────────────────────
  if (isThisVibePlaying.value) {
    log.debug('MAIN PLAYER — pause (Case B: same vibe playing)');
    store.pausePlayback();
    return;
  }

  // ── Case C: this vibe is paused → resume ─────────────────────────────────
  if (isThisVibePaused.value) {
    log.debug('MAIN PLAYER — resume (Case C: same vibe paused)');
    store.resumePlayback();
    return;
  }

  // ── Case A / D: start this vibe (idle OR switching from another vibe) ────
  if (!vibeSounds.value.length) {
    await showPlaybackToast('No sounds configured');
    return;
  }

  if (!hasPlayableLayers.value) {
    await showPlaybackToast('No playable sounds available');
    return;
  }

  const totalLayers   = executionPlan.value.length;
  const playableCount = playableLayers.value.length;
  const soundCount    = vibeSounds.value.length;

  log.debug(
    isAnotherVibePlaying.value
      ? 'MAIN PLAYER — play (Case D: switching from another vibe)'
      : 'MAIN PLAYER — play (Case A: idle)',
    { vibeId: vibeId.value, planLayers: totalLayers, playableCount },
  );

  // playVibe() atomically: sets vibe context + optimistic state + clock + audio.
  // It also stops any currently active session via audioPlayerService.playPlan().
  // artwork_url is already resolved by the API (fallback: thumbnail_url).
  const started = store.playVibe({
    vibeId:       vibeId.value,
    vibeName:     vibe.value?.name ?? '',
    soundSummary: `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    artworkUrl: getVibeArtworkUrl(vibe.value),
    layers:       executionPlan.value,
  });

  if (isDev) {
    diagLastPlayResult.value = started;
    diagServiceLayers.value  = audioPlayerService.hasActiveLayers();
  }

  log.debug('MAIN PLAYER — playVibe result', {
    started,
    svcHasActive: audioPlayerService.hasActiveLayers(),
  });

  if (!started) {
    log.warn('MAIN PLAYER — playVibe returned false (all layers invalid)');
    await showPlaybackToast(
      playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
    );
    return;
  }

  if (playableCount < totalLayers) {
    await showPlaybackToast('Some sounds could not be played');
  }
}

async function handleRestartVibe(): Promise<void> {
  if (loading.value || isThisVibePreparing.value) return;

  if (!vibeSounds.value.length) {
    await showPlaybackToast('No sounds configured');
    return;
  }

  if (!hasPlayableLayers.value) {
    await showPlaybackToast('No playable sounds available');
    return;
  }

  const totalLayers   = executionPlan.value.length;
  const playableCount = playableLayers.value.length;
  const soundCount    = vibeSounds.value.length;

  log.debug('MAIN PLAYER — restart');

  // Use playVibe() for restart too — it resets vibe context, clock, and audio.
  const started = store.playVibe({
    vibeId:       vibeId.value,
    vibeName:     vibe.value?.name ?? '',
    soundSummary: `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    artworkUrl: getVibeArtworkUrl(vibe.value),
    layers:       executionPlan.value,
  });

  if (!started) {
    await showPlaybackToast(
      playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
    );
    return;
  }

  if (playableCount < totalLayers) {
    await showPlaybackToast('Some sounds could not be played');
  }
}

function handleStopVibe(): void {
  store.stopPlayback();
}

async function handleRemoveOfflineDownload(): Promise<void> {
  const id = vibeId.value;
  try {
    await removeDownloadedVibe(id);
    vibeOfflineReady.value = false;
    await showPlaybackToast('Offline download removed');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not remove offline files.';
    await showPlaybackToast(msg);
  }
}

async function handleDownloadForOffline(): Promise<void> {
  if (isDownloading.value) return;

  if (!executionPlan.value.length || !hasPlayableLayers.value) {
    await showPlaybackToast('No sounds to download');
    return;
  }

  if (!navigator.onLine) {
    await showPlaybackToast('Connect to the internet to download sounds');
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    await showPlaybackToast('Offline download is available in the installed app (Android/iOS), not in the browser.');
    return;
  }

  const id   = vibeId.value;
  const plan = executionPlan.value;

  log.debug('[AudioCache] download requested', { vibeId: id, layers: plan.length });
  isDownloading.value = true;

  try {
    const result = await store.cacheVibeAudio(id, plan);

    log.debug('[AudioCache] cache result', {
      vibeId:    id,
      succeeded: result.succeeded,
      skipped:   result.skipped,
      failed:    result.failed,
    });

    if (result.failed > 0) {
      const failedNames = result.details
        .filter((d) => d.status === 'failed')
        .map((d) => d.soundName);
      log.warn('[AudioCache] failed layers', { vibeId: id, failed: failedNames });
    }

    if (result.succeeded === 0 && result.failed > 0) {
      await showPlaybackToast('Could not download this sound.');
    } else if (result.failed > 0) {
      await showPlaybackToast(
        `Downloaded ${result.succeeded} sound${result.succeeded !== 1 ? 's' : ''}. ${result.failed} could not be downloaded.`,
      );
    } else if (result.succeeded === 0) {
      await showPlaybackToast('No sounds were downloaded.');
    } else {
      const v = vibe.value;
      if (v?.id === id && vibeSounds.value.length > 0) {
        try {
          await saveOfflineVibeSnapshot(id, v, vibeSounds.value);
          log.debug('[OfflineVibe] snapshot saved after download', {
            vibeId: id,
            layers: vibeSounds.value.length,
          });
        } catch (snapErr) {
          const msg = snapErr instanceof Error ? snapErr.message : String(snapErr);
          log.warn('[OfflineVibe] snapshot save failed', { vibeId: id, error: msg });
        }
      }
      await refreshOfflineDownloadState();
      await showPlaybackToast('Downloaded for offline');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.warn('[AudioCache] download failed', { vibeId: id, error: msg });
    await showPlaybackToast('Could not download this sound.');
  } finally {
    isDownloading.value = false;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function handleBack(): void {
  // Do NOT stop playback — the MiniPlayer keeps the session alive while the
  // user browses other screens. Explicit stop is only via handleStopVibe().
  router.back();
}

// ── Hero background (shared helpers in @/utils/artwork) ───────────────────────

const heroBackground = computed(() => getVibePlayerBackgroundStyle(vibe.value));

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  log.debug('mounted', { vibeId: vibeId.value });
  loading.value = true;
  loadedFromOfflineSnapshot.value = false;
  offlineUnavailableAfterLoad.value = false;

  await Promise.all([
    fetchVibe(vibeId.value),
    fetchVibeSounds(vibeId.value),
  ]);

  const id        = vibeId.value;
  const soundsOk  = vibeSounds.value.length > 0;

  if (soundsOk) {
    buildPlan(vibeSounds.value);
  } else {
    const snap = await getOfflineVibeSnapshot(id);
    if (snap && snap.vibeId === id && snap.vibeSounds.length > 0) {
      hydrateSelectedVibeFromOffline(offlineMetaToVibe(snap.vibe));
      hydrateVibeSoundsFromOffline(snap.vibeSounds);
      buildPlan(vibeSounds.value);
      loadedFromOfflineSnapshot.value = true;
      log.debug('[OfflineVibe] restored snapshot', {
        vibeId: id,
        layers: snap.vibeSounds.length,
      });
      if (import.meta.env.DEV) {
        console.log('[OfflineMode] vibe UI hydrated from offline snapshot', { vibeId: id });
      }
    } else {
      const offline =
        typeof navigator !== 'undefined' && !navigator.onLine;
      offlineUnavailableAfterLoad.value = offline;
      if (offline) {
        await showPlaybackToast('This vibe is not available offline');
      }
      buildPlan(vibeSounds.value);
    }
  }

  loading.value = false;
  log.debug('loaded', {
    sounds:           vibeSounds.value.length,
    planLayers:       executionPlan.value.length,
    offlineSnapshot:  loadedFromOfflineSnapshot.value,
  });

  // Poll service state at 1 Hz for the DEV STATE panel (DEV mode only).
  if (isDev) {
    _diagTickId = setInterval(() => {
      diagServiceLayers.value = audioPlayerService.hasActiveLayers();
    }, 1_000);
  }
});

onUnmounted(() => {
  log.debug('unmounted — audio preserved for MiniPlayer');
  // Do NOT call stopAll() — audio must persist for the MiniPlayer after
  // navigating away. The execution plan can be cleared safely because it
  // will be rebuilt via buildPlan() if the user returns to this page.
  clearPlan();

  if (_diagTickId !== null) {
    clearInterval(_diagTickId);
    _diagTickId = null;
  }
});
</script>

<style scoped>
/* ── Reset Ionic content background ──────────────────── */
.player-content {
  --background: #000;
}

/* ── Full-screen wrap ────────────────────────────────── */
.player-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
}

/* ── Background artwork / gradient ───────────────────── */
.player-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  transform-origin: center center;
  animation: player-bg-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: opacity, transform;
}

@keyframes player-bg-enter {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
  to {
    opacity: 1;
    transform: scale(1.03);
  }
}

.player-bg--image {
  animation-name: player-bg-enter, player-bg-drift;
  animation-duration: 0.55s, 18s;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1), ease-in-out;
  animation-fill-mode: both, none;
  animation-iteration-count: 1, infinite;
  animation-direction: normal, alternate;
}

@keyframes player-bg-drift {
  from {
    transform: scale(1.03) translate(0, 0);
  }
  to {
    transform: scale(1.05) translate(-0.6%, 0.4%);
  }
}

/* Gradient hero — no Ken Burns drift */
.player-bg:not(.player-bg--image) {
  animation: player-bg-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ── Overlays ────────────────────────────────────────── */
.player-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  transition: opacity 0.45s ease;
  background: linear-gradient(
    185deg,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0.08) 28%,
    rgba(0, 0, 0, 0.18) 52%,
    rgba(0, 0, 0, 0.88) 100%
  );
}

.player-overlay--vignette {
  background: radial-gradient(
    ellipse 90% 75% at 50% 38%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.28) 62%,
    rgba(0, 0, 0, 0.72) 100%
  );
  mix-blend-mode: multiply;
  opacity: 0.92;
}

/* ── Header ──────────────────────────────────────────── */
.player-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 20px) + 10px) max(20px, env(safe-area-inset-right)) 14px max(20px, env(safe-area-inset-left));
}

.player-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(8, 10, 18, 0.42);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  color: rgba(255, 255, 255, 0.96);
  font-size: 22px;
  cursor: pointer;
  padding: 0;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 8px 28px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.18s ease,
    background 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease;
  -webkit-tap-highlight-color: transparent;
}

.player-icon-btn:hover {
  background: rgba(14, 18, 30, 0.55);
  border-color: rgba(255, 255, 255, 0.22);
}

.player-icon-btn:active {
  transform: scale(0.93);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.player-icon-btn--menu {
  border-radius: 14px;
}

/* ── Center: Play button ─────────────────────────────── */
.player-center {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
}

.player-spinner-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s ease;
}

.player-spinner-wrap--preparing {
  animation: player-preparing-halo 1.5s ease-in-out infinite;
}

@keyframes player-preparing-halo {
  0%,
  100% {
    filter: drop-shadow(0 0 0 rgba(56, 189, 248, 0));
    opacity: 1;
  }
  50% {
    filter: drop-shadow(0 0 22px rgba(56, 189, 248, 0.35));
    opacity: 0.96;
  }
}

.player-spinner {
  width: 48px;
  height: 48px;
  color: rgba(255, 255, 255, 0.8);
}

.player-control-btn {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.88);
  background: linear-gradient(
    155deg,
    rgba(28, 32, 48, 0.72) 0%,
    rgba(12, 14, 22, 0.58) 100%
  );
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.14) inset,
    0 12px 40px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(0, 0, 0, 0.25);
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.28s ease,
    border-color 0.28s ease,
    opacity 0.22s ease,
    filter 0.28s ease;
  -webkit-tap-highlight-color: transparent;
}

.player-control-btn:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.18) inset,
    0 16px 44px rgba(0, 0, 0, 0.5),
    0 0 48px rgba(29, 172, 146, 0.18);
}

.player-control-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.player-control-btn--playing {
  border-color: rgba(167, 243, 208, 0.55);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 12px 48px rgba(0, 0, 0, 0.48),
    0 0 52px rgba(74, 222, 128, 0.28);
}

.player-control-btn--paused {
  border-color: rgba(251, 191, 36, 0.45);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 12px 40px rgba(0, 0, 0, 0.45),
    0 0 36px rgba(251, 191, 36, 0.22);
}

.player-control-btn--disabled {
  opacity: 0.38;
  cursor: not-allowed;
  filter: grayscale(0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.player-control-icon {
  font-size: 40px;
  margin-left: 3px;
}

.player-control-btn--playing .player-control-icon {
  margin-left: 0;
}

/* ── Bottom panel ────────────────────────────────────── */
.player-bottom {
  position: relative;
  z-index: 2;
  padding: 20px max(24px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom, 20px) + 36px) max(24px, env(safe-area-inset-left));
}

.player-inline-state {
  margin-bottom: var(--app-space-4, 16px);
}

.player-warning {
  font-size: 12px;
  color: rgba(253, 224, 138, 0.96);
  font-weight: 600;
  margin: 0 0 14px;
  letter-spacing: 0.02em;
  line-height: 1.45;
}

.player-warning--banner {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(180, 83, 9, 0.22);
  border: 1px solid rgba(251, 191, 36, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.player-identity {
  margin-bottom: 4px;
}

.player-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.48);
  margin: 0 0 10px;
  text-transform: uppercase;
}

.player-title {
  font-size: clamp(26px, 7vw, 34px);
  font-weight: 800;
  color: #fff;
  margin: 0 0 10px;
  line-height: 1.12;
  letter-spacing: -0.4px;
  text-shadow: 0 2px 28px rgba(0, 0, 0, 0.55);
}

.player-desc {
  font-size: 14px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.68);
  margin: 0 0 12px;
  max-width: 36rem;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.player-sounds-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.62);
  margin: 0 0 18px;
  line-height: 1.5;
  font-weight: 500;
}

/* ── Premium badges ──────────────────────────────────── */
.player-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.player-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid transparent;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
  transition: transform 0.18s ease, box-shadow 0.22s ease;
}

.player-badge:active {
  transform: scale(0.97);
}

.player-badge__icon {
  font-size: 15px;
  flex-shrink: 0;
  opacity: 0.95;
}

.player-badge--success {
  color: rgba(220, 252, 231, 0.98);
  background: rgba(16, 185, 129, 0.28);
  border-color: rgba(52, 211, 153, 0.45);
}

.player-badge--info {
  color: rgba(219, 234, 254, 0.95);
  background: rgba(59, 130, 246, 0.26);
  border-color: rgba(147, 197, 253, 0.38);
}

.player-badge--warn {
  color: rgba(254, 243, 198, 0.98);
  background: rgba(245, 158, 11, 0.26);
  border-color: rgba(253, 224, 138, 0.42);
}

.player-badge--neutral {
  color: rgba(241, 245, 249, 0.94);
  background: rgba(148, 163, 184, 0.22);
  border-color: rgba(226, 232, 240, 0.35);
}

/* ── Status row ──────────────────────────────────────── */
.player-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.player-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.38);
  flex-shrink: 0;
  transition:
    background 0.35s ease,
    box-shadow 0.35s ease,
    transform 0.35s ease;
}

.player-status-dot--active {
  background: #4ade80;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.85);
  transform: scale(1.05);
}

.player-status-dot--paused {
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.65);
}

.player-status-dot--preparing {
  background: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.65);
  animation: player-dot-pulse 1.1s ease-in-out infinite;
}

@keyframes player-dot-pulse {
  50% {
    opacity: 0.65;
    transform: scale(0.92);
  }
}

.player-menu-ion-content {
  --padding-top: 0;
  --padding-bottom: 0;
}

.player-menu-ion-content :deep(ion-item) {
  --ripple-color: rgba(29, 172, 146, 0.35);
  --transition: background 0.18s ease;
}

.player-menu-icon {
  font-size: 18px;
  margin-inline-end: 8px;
}

.player-status-text {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.82);
  letter-spacing: 0.02em;
}

/* ── Sound layers ────────────────────────────────────── */
.player-layers {
  margin-top: 4px;
  padding-bottom: 8px;
}

.player-layers-heading {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.player-layer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-layer-card {
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.09) 0%,
    rgba(12, 14, 22, 0.42) 100%
  );
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.2s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease;
}

.player-layer-card:active {
  transform: scale(0.99);
}

.player-layer-card--muted {
  opacity: 0.52;
  border-style: dashed;
}

.player-layer-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.player-layer-name {
  font-size: 15px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.player-layer-mode {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(167, 243, 208, 0.92);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(29, 172, 146, 0.22);
  border: 1px solid rgba(52, 211, 153, 0.35);
}

.player-layer-card--muted .player-layer-mode {
  color: rgba(248, 250, 252, 0.65);
  background: rgba(148, 163, 184, 0.15);
  border-color: rgba(148, 163, 184, 0.28);
}

.player-layer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.player-layer-chip {
  font-size: 11px;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.82);
  padding: 4px 9px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
  letter-spacing: 0.02em;
}
.player-dev-panel {
  margin-top: 20px;
  border: 1.5px dashed rgba(245, 158, 11, 0.55);
  border-radius: 12px;
  padding: 12px 14px 10px;
  background: rgba(0, 0, 0, 0.38);
  max-height: 220px;
  overflow-y: auto;
}

.player-dev-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.player-dev-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  background: #f59e0b;
  border-radius: 4px;
  padding: 2px 6px;
}

.player-dev-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(253, 230, 138, 0.95);
}

.player-dev-count {
  margin-left: auto;
  font-size: 11px;
  color: rgba(251, 191, 36, 0.85);
}

.player-dev-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 6px;
}

.player-dev-layer {
  border-top: 1px solid rgba(245, 158, 11, 0.22);
  padding: 10px 0 8px;
}

.player-dev-layer-summary {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 6px;
  line-height: 1.4;
}

.player-dev-layer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.player-dev-layer-meta span {
  font-size: 11px;
  font-family: monospace;
  color: rgba(253, 230, 138, 0.92);
  background: rgba(245, 158, 11, 0.14);
  border-radius: 4px;
  padding: 2px 6px;
}

.player-dev-unplayable {
  color: rgba(248, 113, 113, 0.95) !important;
  background: rgba(248, 113, 113, 0.12) !important;
}

/* ── DEV Composable State panel ───────────────────────── */
.player-dev-panel--state {
  border-color: rgba(99, 102, 241, 0.55);
  max-height: none;
}

.player-dev-badge--state {
  background: #6366f1;
}

.player-dev-state-hint {
  margin: 0 0 10px;
  font-size: 11px;
  color: rgba(199, 210, 254, 0.7);
  font-style: italic;
}


.player-dev-state-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  row-gap: 5px;
  font-size: 12px;
  font-family: monospace;
}

.player-dev-state-key {
  color: rgba(199, 210, 254, 0.65);
  white-space: nowrap;
}

.player-dev-state-val {
  color: rgba(224, 231, 255, 0.9);
}

.player-dev-state--idle    { color: rgba(199, 210, 254, 0.5); }
.player-dev-state--playing { color: #34d399; }
.player-dev-state--paused  { color: #fbbf24; }
.player-dev-state--preparing { color: #38bdf8; }
.player-dev-state--error { color: #f87171; }

/* ── DEV Logs panel ─────────────────────────────────── */

.player-dev-panel--logs {
  margin-top: 8px;
}

.player-dev-badge--logs {
  background: #0ea5e9;
}

.player-dev-logs-header {
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.player-dev-logs-count {
  margin-left: auto;
  font-size: 11px;
  color: rgba(186, 230, 253, 0.7);
  font-family: monospace;
}

.player-dev-logs-clear {
  margin-left: 8px;
  background: rgba(255,255,255,0.12);
  border: none;
  border-radius: 4px;
  color: rgba(186, 230, 253, 0.8);
  font-size: 11px;
  padding: 1px 5px;
  cursor: pointer;
  line-height: 1.4;
}

.player-dev-logs-toggle {
  margin-left: 6px;
  font-size: 11px;
  color: rgba(186, 230, 253, 0.5);
}

.player-dev-logs-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: 8px;
}

.player-dev-log-entry {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10.5px;
  font-family: monospace;
  line-height: 1.4;
  border-radius: 4px;
  padding: 2px 4px;
  background: rgba(255,255,255,0.04);
}

.player-dev-log-entry--warn  { background: rgba(251, 191, 36, 0.10); }
.player-dev-log-entry--error { background: rgba(239, 68,  68, 0.14); }

.player-dev-log-ts {
  color: rgba(148, 163, 184, 0.65);
  flex-shrink: 0;
}

.player-dev-log-prefix {
  color: #7dd3fc;
  flex-shrink: 0;
  font-weight: 700;
}

.player-dev-log-msg {
  color: rgba(224, 231, 255, 0.9);
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.player-dev-log-entry--warn  .player-dev-log-msg { color: #fcd34d; }
.player-dev-log-entry--error .player-dev-log-msg { color: #fca5a5; }

.player-dev-log-data {
  width: 100%;
  font-size: 10px;
  color: rgba(148, 163, 184, 0.6);
  word-break: break-all;
}
</style>
