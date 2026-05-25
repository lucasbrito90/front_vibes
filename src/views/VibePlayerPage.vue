<template>
  <ion-page class="player-page" data-testid="player-page">
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
          <div v-if="loading" class="player-spinner-wrap">
            <AppLoadingState
              compact
              tone="inverse"
              title="Loading vibe…"
            />
          </div>

          <button
            v-else
            type="button"
            class="player-control-btn"
            data-testid="player-play-button"
            :class="centerButtonClass"
            :disabled="!canUsePlaybackControls || isThisVibePreparing"
            :aria-label="centerAriaLabel"
            @click="togglePlayback"
          >
            <Transition name="player-control-icon" mode="out-in">
              <ion-spinner
                v-if="isThisVibePreparing"
                key="preparing"
                name="crescent"
                class="player-control-spinner"
              />
              <ion-icon
                v-else
                key="control"
                :icon="centerIcon"
                class="player-control-icon"
              />
            </Transition>
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
            data-testid="player-warning-banner"
          >
            {{ warningText }}
          </p>

          <div
            class="player-identity"
            :class="{ 'player-identity--pending': loading }"
            :key="`identity-${vibeId}`"
          >
            <p class="player-label">Ambient mix</p>
            <h1 class="player-title">{{ displayVibe?.name ?? '…' }}</h1>
            <p v-if="displayVibe?.description" class="player-desc">{{ displayVibe.description }}</p>
            <p class="player-sounds-text">{{ soundsSummary }}</p>
          </div>

          <div
            v-if="!loading && badgeItems.length > 0"
            class="player-badge-row app-fade-in"
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

          <div v-if="!loading" class="player-status-row">
            <span
              class="player-status-dot"
              :class="statusDotClass"
            />
            <span class="player-status-text">{{ statusText }}</span>
          </div>

          <section
            v-if="executionPlan.length > 0 && !loading"
            :key="`layers-${vibeId}`"
            class="player-layers app-fade-in"
            aria-label="Sound layers in this vibe"
            data-testid="player-layers-section"
          >
            <h2 class="player-layers-heading">Sound layers</h2>
            <ul class="player-layer-list">
              <li
                v-for="layer in executionPlan"
                :key="layer.soundId"
                class="player-layer-card app-slide-up"
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

          <component :is="PlayerDebugPanel" v-if="isDev && PlayerDebugPanel && !loading" />

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
  IonSpinner,
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
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue';
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
import { createLogger } from '@/utils/player-debug';
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
  currentVibeId,
} = storeToRefs(store);

const menuTriggerId = computed(() => `vibe-player-menu-${vibeId.value}`);

const loading                   = ref(false);
const controlPulse              = ref(false);
const isDownloading             = ref(false);
let loadGeneration              = 0;
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

const PlayerDebugPanel = isDev
  ? defineAsyncComponent(() => import('@/components/debug/PlayerDebugPanel.vue'))
  : null;

const _isNativePlatform = Capacitor.isNativePlatform();

// Prefer the already-loaded vibe from the list; fall back to selectedVibe
const vibe = computed(() =>
  vibes.value.find((v) => v.id === vibeId.value)
  ?? (selectedVibe.value?.id === vibeId.value ? selectedVibe.value : null),
);

/** Route-scoped vibe metadata — never show a previous route's title/artwork. */
const displayVibe = computed(() => {
  const v = vibe.value;
  if (!v || v.id !== vibeId.value) return null;
  return v;
});

const heroHasArtwork = computed(() => !!getVibePlayerBackgroundUrl(displayVibe.value));

/** Remount background layer for a short fade-in when vibe or artwork changes. */
const heroBgKey = computed(() => {
  const v = displayVibe.value;
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
  (id, prev) => {
    if (prev != null && id !== prev) {
      hydrateVibeSoundsFromOffline([]);
      clearPlan();
      isDownloading.value = false;
    }
    offlineUnavailableAfterLoad.value = false;
    void refreshOfflineDownloadState();
    void loadPlayerPage(id);
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

/** True when a DIFFERENT vibe is actively playing, paused, or preparing. */
const isAnotherVibePlaying = computed(
  () =>
    currentVibeId.value !== null
    && currentVibeId.value !== vibeId.value
    && (playbackState.value === 'playing'
      || playbackState.value === 'paused'
      || playbackState.value === 'preparing'),
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
      || playbackErroredThisVibe.value
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
  if (loading.value) return '…';

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
  if (isThisVibePreparing.value) return 'Preparing playback…';
  if (playbackErroredThisVibe.value) return 'Playback couldn’t start';
  if (isThisVibePlaying.value) return `Playing • ${formatElapsed(elapsedSeconds.value)}`;
  if (isThisVibePaused.value)  return `Paused • ${formatElapsed(elapsedSeconds.value)}`;
  if (isAnotherVibePlaying.value) return 'Another vibe is playing';
  return 'Ready';
});

/** Dot reflects whether THIS vibe is playing, paused, preparing, or errored. */
const statusDotClass = computed((): Record<string, boolean> => ({
  'player-status-dot--active': isThisVibePlaying.value,
  'player-status-dot--paused': isThisVibePaused.value,
  'player-status-dot--preparing': isThisVibePreparing.value,
  'player-status-dot--error': playbackErroredThisVibe.value,
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
      label: 'Preparing playback',
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
  if (playbackErroredThisVibe.value) {
    items.push({
      key: 'error',
      label: 'Couldn’t start',
      icon:  stopCircleOutline,
      tone:  'warn',
    });
  }
  return items;
});

const centerIcon = computed(() =>
  isThisVibePlaying.value ? pauseOutline : playOutline,
);

const centerButtonClass = computed(() => ({
  'player-control-btn--disabled':
    !canUsePlaybackControls.value && !isThisVibePreparing.value,
  'player-control-btn--playing': isThisVibePlaying.value,
  'player-control-btn--paused': isThisVibePaused.value,
  'player-control-btn--preparing': isThisVibePreparing.value,
  'player-control-btn--error': playbackErroredThisVibe.value,
  'player-control-btn--pulse': controlPulse.value,
}));

const centerAriaLabel = computed((): string => {
  if (isThisVibePreparing.value) return 'Starting playback';
  if (playbackErroredThisVibe.value) return 'Retry playback';
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
    vibeName:     displayVibe.value?.name ?? '',
    soundSummary: `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    artworkUrl: getVibeArtworkUrl(displayVibe.value),
    layers:       executionPlan.value,
  });

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
    vibeName:     displayVibe.value?.name ?? '',
    soundSummary: `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    artworkUrl: getVibeArtworkUrl(displayVibe.value),
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
      const v = displayVibe.value;
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

const heroBackground = computed(() => getVibePlayerBackgroundStyle(displayVibe.value));

function pulseControlFeedback(): void {
  controlPulse.value = false;
  window.requestAnimationFrame(() => {
    controlPulse.value = true;
    window.setTimeout(() => {
      controlPulse.value = false;
    }, 480);
  });
}

watch(
  () => [isThisVibePlaying.value, isThisVibePaused.value] as const,
  ([playing, paused], prev) => {
    if (!prev) return;
    const [wasPlaying, wasPaused] = prev;
    const toggledPause =
      (playing && wasPaused && !wasPlaying)
      || (paused && wasPlaying && !wasPaused);
    if (toggledPause) pulseControlFeedback();
  },
);

async function loadPlayerPage(id: number): Promise<void> {
  const generation = ++loadGeneration;
  log.debug('loadPlayerPage', { vibeId: id, generation });

  loading.value = true;
  loadedFromOfflineSnapshot.value = false;
  offlineUnavailableAfterLoad.value = false;
  clearPlan();

  await Promise.all([
    fetchVibe(id),
    fetchVibeSounds(id),
  ]);

  if (generation !== loadGeneration) {
    log.debug('loadPlayerPage — stale generation, aborting UI update', { id, generation });
    return;
  }

  const soundsOk = vibeSounds.value.length > 0;

  if (soundsOk) {
    buildPlan(vibeSounds.value);
  } else {
    const snap = await getOfflineVibeSnapshot(id);
    if (generation !== loadGeneration) return;

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

  if (generation !== loadGeneration) return;

  loading.value = false;
  log.debug('loaded', {
    sounds:           vibeSounds.value.length,
    planLayers:       executionPlan.value.length,
    offlineSnapshot:  loadedFromOfflineSnapshot.value,
  });
}

onUnmounted(() => {
  log.debug('unmounted — audio preserved for MiniPlayer');
  // Do NOT call stopAll() — audio must persist for the MiniPlayer after
  // navigating away. The execution plan can be cleared safely because it
  // will be rebuilt via buildPlan() if the user returns to this page.
  clearPlan();

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
    transform var(--app-motion-fast) var(--app-ease-standard),
    background var(--app-motion-base) var(--app-ease-standard),
    border-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
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
  transition: opacity var(--app-motion-base) var(--app-ease-standard);
}

.player-control-spinner {
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.92);
}

.player-control-icon-enter-active,
.player-control-icon-leave-active {
  transition:
    opacity var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.player-control-icon-enter-from,
.player-control-icon-leave-to {
  opacity: 0;
  transform: scale(0.82);
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
    transform var(--app-motion-fast) var(--app-ease-emphasized),
    box-shadow var(--app-motion-base) var(--app-ease-standard),
    border-color var(--app-motion-base) var(--app-ease-standard),
    opacity var(--app-motion-fast) var(--app-ease-standard),
    filter var(--app-motion-base) var(--app-ease-standard);
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

.player-control-btn--preparing {
  border-color: rgba(56, 189, 248, 0.62);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 12px 44px rgba(0, 0, 0, 0.48),
    0 0 48px rgba(56, 189, 248, 0.32);
  animation: player-preparing-ring 1.35s ease-in-out infinite;
}

.player-control-btn--error {
  border-color: rgba(248, 113, 113, 0.55);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 12px 40px rgba(0, 0, 0, 0.45),
    0 0 36px rgba(248, 113, 113, 0.24);
}

@keyframes player-preparing-ring {
  0%,
  100% {
    transform: scale(1);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.12) inset,
      0 12px 44px rgba(0, 0, 0, 0.48),
      0 0 36px rgba(56, 189, 248, 0.22);
  }
  50% {
    transform: scale(1.02);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.14) inset,
      0 14px 48px rgba(0, 0, 0, 0.5),
      0 0 56px rgba(56, 189, 248, 0.42);
  }
}

.player-control-btn--pulse {
  animation: player-control-pulse 0.48s var(--app-ease-emphasized);
}

@keyframes player-control-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
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
  transition: opacity var(--app-motion-base) var(--app-ease-standard);
}

.player-identity--pending .player-title,
.player-identity--pending .player-sounds-text {
  color: rgba(255, 255, 255, 0.38);
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
  transition:
    transform var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
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

.player-status-dot--error {
  background: #f87171;
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.65);
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
    transform var(--app-motion-base) var(--app-ease-standard),
    border-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
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
</style>
