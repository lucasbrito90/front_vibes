<template>
  <ion-page class="player-page">
    <ion-content :fullscreen="true" class="player-content">
      <div class="player-wrap" :style="{ background: heroGradient }">

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

          <!-- DEV: Composable state — visible on device without ADB -->
          <div v-if="!loading" class="player-dev-panel player-dev-panel--state">
            <div class="player-dev-panel-header">
              <span class="player-dev-badge player-dev-badge--state">STATE</span>
              <span class="player-dev-title">Composable State</span>
            </div>
            <div class="player-dev-state-grid">
              <span class="player-dev-state-key">playbackState</span>
              <strong class="player-dev-state-val" :class="`player-dev-state--${playbackState}`">{{ playbackState }}</strong>

              <span class="player-dev-state-key">currentVibeId</span>
              <strong class="player-dev-state-val">{{ currentVibeId ?? 'null' }}</strong>

              <span class="player-dev-state-key">hasActiveLayers</span>
              <strong class="player-dev-state-val">{{ hasActiveLayers }}</strong>

              <span class="player-dev-state-key">executionPlan</span>
              <strong class="player-dev-state-val">{{ executionPlan.length }} layers</strong>

              <span class="player-dev-state-key">playable</span>
              <strong class="player-dev-state-val">{{ playableLayers.length }}</strong>
            </div>
          </div>

          <!-- DEV: Native Audio POC — single loop layer test -->
          <div v-if="!loading && pocLoopLayer" class="player-dev-panel player-dev-panel--poc">
            <div class="player-dev-panel-header">
              <span class="player-dev-badge player-dev-badge--poc">DEV</span>
              <span class="player-dev-title">Native Audio POC</span>
            </div>
            <p class="player-dev-layer-summary">
              {{ pocLoopLayer.soundName }} — vol {{ pocLoopLayer.volume }}/100
            </p>

            <div class="player-dev-poc-controls">
              <button class="player-dev-poc-btn" :disabled="pocBusy || pocState === 'playing'" @click="pocPlay">
                ▶ Play
              </button>
              <button class="player-dev-poc-btn" :disabled="pocBusy || pocState !== 'playing'" @click="pocPause">
                ⏸ Pause
              </button>
              <button class="player-dev-poc-btn" :disabled="pocBusy || pocState !== 'paused'" @click="pocResume">
                ▶▶ Resume
              </button>
              <button class="player-dev-poc-btn player-dev-poc-btn--stop" :disabled="pocBusy || pocState === 'idle'" @click="pocStop">
                ■ Stop
              </button>
            </div>

            <!-- Status row -->
            <div class="player-dev-poc-status">
              <span class="player-dev-poc-state-label">state:</span>
              <strong class="player-dev-poc-state-value" :class="`player-dev-poc-state--${pocState}`">
                {{ pocBusy ? 'busy…' : pocState }}
              </strong>
            </div>

            <!-- Last operation result (ok or error) -->
            <div v-if="pocLastLog" class="player-dev-poc-log" :class="{ 'player-dev-poc-log--error': pocLastError }">
              {{ pocLastLog }}
            </div>
          </div>

          <div v-else-if="!loading && !pocLoopLayer" class="player-dev-panel player-dev-panel--poc">
            <div class="player-dev-panel-header">
              <span class="player-dev-badge player-dev-badge--poc">DEV</span>
              <span class="player-dev-title">Native Audio POC</span>
            </div>
            <p class="player-dev-empty">No loop layer available in execution plan.</p>
          </div>

          <!-- DEV: Execution Plan (keep visible for debugging) -->
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

import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player.store';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { useVibeSounds } from '@/composables/useVibeSounds';
import { useVibes } from '@/composables/useVibes';
import {
  playLoopLayer,
  pauseLoopLayer,
  resumeLoopLayer,
  stopLoopLayer,
} from '@/services/native-audio-poc.service';
import { isExecutionLayerPlayable } from '@/services/player-engine.service';

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

// Prefer the already-loaded vibe from the list; fall back to selectedVibe
const vibe = computed(() =>
  vibes.value.find((v) => v.id === vibeId.value)
  ?? (selectedVibe.value?.id === vibeId.value ? selectedVibe.value : null),
);

// ── Execution plan helpers ────────────────────────────────────────────────────

const playableLayers = computed(() => executionPlan.value.filter(isExecutionLayerPlayable));

const hasPlayableLayers = computed(() => playableLayers.value.length > 0);

/** Allow pause/resume/stop while session active even if config became invalid mid-flight. */
const canUsePlaybackControls = computed(
  () =>
    hasPlayableLayers.value
    || playbackState.value === 'playing'
    || playbackState.value === 'paused',
);

const warningText = computed((): string | null => {
  if (loading.value) return null;
  if (!vibeSounds.value.length) return 'No sounds configured';
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
  if (playbackState.value === 'playing') {
    return `Playing • ${formatElapsed(elapsedSeconds.value)}`;
  }
  if (playbackState.value === 'paused') {
    return `Paused • ${formatElapsed(elapsedSeconds.value)}`;
  }
  return 'Ready';
});

/** Dot reflects service-backed playback state (playing vs paused vs idle). */
const statusDotClass = computed((): Record<string, boolean> => ({
  'player-status-dot--active': playbackState.value === 'playing',
  'player-status-dot--paused': playbackState.value === 'paused',
}));

const centerIcon = computed(() =>
  playbackState.value === 'playing' ? pauseOutline : playOutline,
);

const centerAriaLabel = computed((): string => {
  if (!loading.value && !canUsePlaybackControls.value) return 'Playback unavailable';
  if (playbackState.value === 'playing') return 'Pause';
  if (playbackState.value === 'paused') return 'Resume';
  return 'Play';
});

// ── DEV: Native Audio POC ─────────────────────────────────────────────────────

/** First playable loop layer in the execution plan, or null if none exists. */
const pocLoopLayer = computed(() =>
  executionPlan.value.find(
    (l) => l.playMode === 'loop' && isExecutionLayerPlayable(l),
  ) ?? null,
);

type PocState = 'idle' | 'playing' | 'paused';
const pocState   = ref<PocState>('idle');
const pocBusy    = ref(false);
const pocLastLog = ref<string | null>(null);
const pocLastError = ref(false);

function _pocLog(msg: string, isError = false): void {
  pocLastLog.value   = msg;
  pocLastError.value = isError;
}

async function _pocRun(
  label: string,
  fn: () => Promise<void>,
  nextState: PocState,
): Promise<void> {
  if (pocBusy.value) return;
  const layer = pocLoopLayer.value;
  if (!layer) return;
  pocBusy.value = true;
  _pocLog(`${label}…`);
  try {
    await fn();
    pocState.value = nextState;
    _pocLog(`${label} OK`);
  } catch (err) {
    _pocLog(`${label} FAILED: ${String(err)}`, true);
  } finally {
    pocBusy.value = false;
  }
}

async function pocPlay(): Promise<void> {
  const layer = pocLoopLayer.value;
  if (!layer) return;
  await _pocRun('play', () => playLoopLayer(layer), 'playing');
}

async function pocPause(): Promise<void> {
  const layer = pocLoopLayer.value;
  if (!layer) return;
  await _pocRun('pause', () => pauseLoopLayer(layer), 'paused');
}

async function pocResume(): Promise<void> {
  const layer = pocLoopLayer.value;
  if (!layer) return;
  await _pocRun('resume', () => resumeLoopLayer(layer), 'playing');
}

async function pocStop(): Promise<void> {
  const layer = pocLoopLayer.value;
  if (!layer) return;
  await _pocRun('stop', () => stopLoopLayer(layer), 'idle');
}

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
  if (loading.value) return;

  if (!vibeSounds.value.length) {
    await showPlaybackToast('No sounds configured');
    return;
  }

  if (!hasPlayableLayers.value) {
    await showPlaybackToast('No playable sounds available');
    return;
  }

  if (playbackState.value === 'idle') {
    const totalLayers   = executionPlan.value.length;
    const playableCount = playableLayers.value.length;
    const soundCount    = vibeSounds.value.length;

    // Set vibe context BEFORE starting audio so the Mini Player is
    // immediately visible on the next reactive flush, before native
    // preload/loop completes asynchronously.
    store.setCurrentVibe(
      vibeId.value,
      vibe.value?.name ?? '',
      `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    );

    const started = store.playPlan(executionPlan.value);

    if (!started) {
      // All layers failed validation — revert vibe context.
      store.clearCurrentVibe();
      await showPlaybackToast(
        playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
      );
      return;
    }

    if (playableCount < totalLayers) {
      await showPlaybackToast('Some sounds could not be played');
    }

    store.beginSessionClock();
  } else if (playbackState.value === 'playing') {
    store.pausePlayback();   // pauses audio + elapsed ticker
  } else {
    store.resumePlayback();  // resumes audio + elapsed ticker
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

  store.setCurrentVibe(
    vibeId.value,
    vibe.value?.name ?? '',
    `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
  );

  const started = store.restartPlayback(executionPlan.value);

  if (!started) {
    store.clearCurrentVibe();
    await showPlaybackToast(
      playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
    );
    return;
  }

  if (playableCount < totalLayers) {
    await showPlaybackToast('Some sounds could not be played');
  }

  store.beginSessionClock();
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

// ── Hero gradient ─────────────────────────────────────────────────────────────

const gradients = [
  'linear-gradient(160deg, #3a1c71 0%, #4a1890 55%, #1a1a6e 100%)',
  'linear-gradient(160deg, #b0298a 0%, #8b2fc9 100%)',
  'linear-gradient(160deg, #1dac92 0%, #0e7490 55%, #0f3f5c 100%)',
  'linear-gradient(160deg, #d97706 0%, #b45309 55%, #7c2d12 100%)',
  'linear-gradient(160deg, #4338ca 0%, #6d28d9 100%)',
];

const heroGradient = computed((): string => {
  const id = vibe.value?.id ?? 0;
  return gradients[id % gradients.length];
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  loading.value = true;
  await Promise.all([
    fetchVibe(vibeId.value),
    fetchVibeSounds(vibeId.value),
  ]);
  buildPlan(vibeSounds.value);
  loading.value = false;
});

onUnmounted(() => {
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

/* ── Native Audio POC styles ──────────────────────────── */

.player-dev-panel--poc {
  border-color: rgba(99, 202, 183, 0.35);
  background: rgba(16, 60, 55, 0.55);
}

.player-dev-badge--poc {
  background: #0d9488;
}

.player-dev-poc-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.player-dev-poc-btn {
  flex: 1 1 auto;
  min-width: 72px;
  padding: 8px 10px;
  border: 1px solid rgba(99, 202, 183, 0.45);
  border-radius: 8px;
  background: rgba(13, 148, 136, 0.22);
  color: rgba(153, 246, 228, 0.95);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.player-dev-poc-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.player-dev-poc-btn--stop {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(220, 38, 38, 0.18);
  color: rgba(252, 165, 165, 0.95);
}

.player-dev-poc-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  font-family: monospace;
}

.player-dev-poc-state-label {
  color: rgba(153, 246, 228, 0.6);
}

.player-dev-poc-state-value {
  font-size: 13px;
}

.player-dev-poc-state--idle    { color: rgba(153, 246, 228, 0.5); }
.player-dev-poc-state--playing { color: #34d399; }
.player-dev-poc-state--paused  { color: #fbbf24; }

.player-dev-poc-log {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-family: monospace;
  line-height: 1.5;
  word-break: break-all;
  background: rgba(13, 148, 136, 0.15);
  color: rgba(153, 246, 228, 0.9);
  border: 1px solid rgba(99, 202, 183, 0.2);
}

.player-dev-poc-log--error {
  background: rgba(220, 38, 38, 0.15);
  color: rgba(252, 165, 165, 0.95);
  border-color: rgba(248, 113, 113, 0.3);
}

/* ── DEV Composable State panel ───────────────────────── */
.player-dev-panel--state {
  border-color: rgba(99, 102, 241, 0.55);
  max-height: none;
}

.player-dev-badge--state {
  background: #6366f1;
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
</style>
