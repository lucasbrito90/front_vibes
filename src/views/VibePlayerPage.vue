<template>
  <ion-page class="player-page">
    <ion-content :fullscreen="true" class="player-content">
      <div class="player-wrap" :style="heroBackground">

        <!-- Depth overlay — transparent top, dark bottom -->
        <div class="player-overlay" />

        <!-- ── Header ───────────────────────────────── -->
        <div class="player-header">
          <button type="button" class="player-icon-btn" aria-label="Back" @click="handleBack">
            <ion-icon :icon="chevronBackOutline" />
          </button>
          <button
            type="button"
            class="player-icon-btn"
            :id="menuTriggerId"
            aria-label="Options"
          >
            <ion-icon :icon="ellipsisVertical" />
          </button>
          <ion-popover :trigger="menuTriggerId" dismiss-on-select="true">
            <ion-content class="player-menu-ion-content">
              <ion-list lines="full">
                <ion-item button :detail="false" lines="full" @click="handleRestartVibe">
                  Restart vibe
                </ion-item>
                <ion-item button :detail="false" lines="none" @click="handleStopVibe">
                  Stop vibe
                </ion-item>
              </ion-list>
            </ion-content>
          </ion-popover>
        </div>

        <!-- ── Center: Play / Pause ──────────────────── -->
        <div class="player-center">
          <div v-if="loading" class="player-spinner-wrap">
            <ion-spinner name="crescent" class="player-spinner" />
          </div>

          <button
            v-else
            class="player-control-btn"
            :class="{ 'player-control-btn--disabled': !canUsePlaybackControls }"
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
          <p v-if="!loading && warningText" class="player-warning">
            {{ warningText }}
          </p>

          <p class="player-label">AMBIENT MIX</p>
          <h1 class="player-title">{{ vibe?.name ?? '…' }}</h1>
          <p class="player-sounds-text">{{ soundsSummary }}</p>

          <div class="player-status-row">
            <span
              class="player-status-dot"
              :class="statusDotClass"
            />
            <span class="player-status-text">{{ statusText }}</span>
          </div>

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
  IonSpinner,
  toastController,
} from '@ionic/vue';
import {
  chevronBackOutline,
  ellipsisVertical,
  pauseOutline,
  playOutline,
} from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Capacitor } from '@capacitor/core';

import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player.store';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { useVibeSounds } from '@/composables/useVibeSounds';
import { useVibes } from '@/composables/useVibes';
import { audioPlayerService } from '@/services/audio-player.service';
import { isExecutionLayerPlayable } from '@/services/player-engine.service';
import { createLogger, logBuffer, clearLogBuffer } from '@/utils/player-debug';

// ── Route / Router ────────────────────────────────────────────────────────────

const route  = useRoute();
const router = useRouter();
const vibeId = computed(() => Number(route.params.id));

// ── Data ──────────────────────────────────────────────────────────────────────

const { vibes, selectedVibe, fetchVibe } = useVibes();
const { vibeSounds, fetchVibeSounds }    = useVibeSounds();
const { executionPlan, buildPlan, clearPlan } = usePlayerEngine();

const store = usePlayerStore();
const {
  playbackState,
  elapsedSeconds,
  hasActiveLayers,
  currentVibeId,
} = storeToRefs(store);

const menuTriggerId = computed(() => `vibe-player-menu-${vibeId.value}`);

const loading = ref(false);

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

// ── Execution plan helpers ────────────────────────────────────────────────────

const playableLayers = computed(() => executionPlan.value.filter(isExecutionLayerPlayable));

const hasPlayableLayers = computed(() => playableLayers.value.length > 0);

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

/** True when a DIFFERENT vibe is currently playing or paused. */
const isAnotherVibePlaying = computed(
  () => currentVibeId.value !== null && currentVibeId.value !== vibeId.value,
);

/**
 * The center button is enabled when:
 *  - this vibe has playable sounds (can start/pause/resume), OR
 *  - this vibe is already active (pause/resume even if plan became invalid), OR
 *  - another vibe is playing (so the user can switch to this one).
 */
const canUsePlaybackControls = computed(
  () =>
    hasPlayableLayers.value
    || isThisVibePlaying.value
    || isThisVibePaused.value
    || isAnotherVibePlaying.value,
);

const warningText = computed((): string | null => {
  if (loading.value) return null;
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
  if (isThisVibePlaying.value) return `Playing • ${formatElapsed(elapsedSeconds.value)}`;
  if (isThisVibePaused.value)  return `Paused • ${formatElapsed(elapsedSeconds.value)}`;
  if (isAnotherVibePlaying.value) return 'Another vibe is playing';
  return 'Ready';
});

/** Dot reflects whether THIS vibe is playing or paused. */
const statusDotClass = computed((): Record<string, boolean> => ({
  'player-status-dot--active': isThisVibePlaying.value,
  'player-status-dot--paused': isThisVibePaused.value,
}));

const centerIcon = computed(() =>
  isThisVibePlaying.value ? pauseOutline : playOutline,
);

const centerAriaLabel = computed((): string => {
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

  if (loading.value) return;

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
    artworkUrl:   vibe.value?.artwork_url ?? vibe.value?.thumbnail_url ?? null,
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
  if (loading.value) return;

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
    artworkUrl:   vibe.value?.artwork_url ?? vibe.value?.thumbnail_url ?? null,
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

// ── Navigation ────────────────────────────────────────────────────────────────

function handleBack(): void {
  // Do NOT stop playback — the MiniPlayer keeps the session alive while the
  // user browses other screens. Explicit stop is only via handleStopVibe().
  router.back();
}

// ── Hero background ───────────────────────────────────────────────────────────
// Priority: player_background_url → thumbnail_url → gradient fallback.
// The API already resolves player_background_url ?? thumbnail_url server-side,
// so player_background_url is the correct field to use here.

const gradients = [
  'linear-gradient(160deg, #3a1c71 0%, #4a1890 55%, #1a1a6e 100%)',
  'linear-gradient(160deg, #b0298a 0%, #8b2fc9 100%)',
  'linear-gradient(160deg, #1dac92 0%, #0e7490 55%, #0f3f5c 100%)',
  'linear-gradient(160deg, #d97706 0%, #b45309 55%, #7c2d12 100%)',
  'linear-gradient(160deg, #4338ca 0%, #6d28d9 100%)',
];

const heroBackground = computed((): Record<string, string> => {
  // player_background_url is already resolved by the API (fallback: thumbnail_url).
  const bgUrl = vibe.value?.player_background_url ?? vibe.value?.thumbnail_url;
  if (bgUrl) {
    log.debug('[Artwork] player background — using image', { bgUrl });
    return {
      backgroundImage:    `url('${bgUrl}')`,
      backgroundSize:     'cover',
      backgroundPosition: 'center',
      backgroundRepeat:   'no-repeat',
    };
  }
  const id = vibe.value?.id ?? 0;
  log.debug('[Artwork] player background — fallback gradient', { id });
  return { background: gradients[id % gradients.length] };
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  log.debug('mounted', { vibeId: vibeId.value });
  loading.value = true;
  await Promise.all([
    fetchVibe(vibeId.value),
    fetchVibeSounds(vibeId.value),
  ]);
  buildPlan(vibeSounds.value);
  loading.value = false;
  log.debug('loaded', {
    sounds:    vibeSounds.value.length,
    planLayers: executionPlan.value.length,
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
  overflow: hidden;
}

/* ── Dark gradient overlay ───────────────────────────── */
.player-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.12) 0%,
    rgba(0, 0, 0, 0.0)  25%,
    rgba(0, 0, 0, 0.25) 60%,
    rgba(0, 0, 0, 0.82) 100%
  );
  pointer-events: none;
}

/* ── Header ──────────────────────────────────────────── */
.player-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 20px) + 12px) 20px 12px;
}

.player-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
}

/* ── Center: Play button ─────────────────────────────── */
.player-center {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-spinner-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-spinner {
  width: 48px;
  height: 48px;
  color: rgba(255, 255, 255, 0.8);
}

.player-control-btn {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.85);
  background: rgba(20, 20, 30, 0.52);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.player-control-btn:active {
  transform: scale(0.94);
}

.player-control-btn--disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.player-control-icon {
  font-size: 36px;
}

/* ── Bottom panel ────────────────────────────────────── */
.player-bottom {
  position: relative;
  z-index: 2;
  padding: 24px 28px calc(env(safe-area-inset-bottom, 20px) + 32px);
}

.player-warning {
  font-size: 12px;
  color: rgba(255, 200, 100, 0.9);
  font-weight: 500;
  margin: 0 0 10px;
  letter-spacing: 0.2px;
}

.player-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 8px;
  text-transform: uppercase;
}

.player-title {
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 8px;
  line-height: 1.15;
  letter-spacing: -0.3px;
}

.player-sounds-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  margin: 0 0 18px;
  line-height: 1.5;
}

/* ── Status row ──────────────────────────────────────── */
.player-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  transition: background 0.3s;
}

.player-status-dot--active {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.7);
}

.player-status-dot--paused {
  background: #fbbf24;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.55);
}

.player-menu-ion-content {
  --padding-top: 0;
  --padding-bottom: 0;
}

.player-status-text {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 0.1px;
}

/* ── DEV Execution Plan (debug) ───────────────────────── */
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
