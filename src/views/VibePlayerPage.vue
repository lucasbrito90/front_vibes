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

import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { usePlayerEngine } from '@/composables/usePlayerEngine';
import { useVibeSounds } from '@/composables/useVibeSounds';
import { useVibes } from '@/composables/useVibes';
import { isExecutionLayerPlayable } from '@/services/player-engine.service';

// ── Route / Router ────────────────────────────────────────────────────────────

const route  = useRoute();
const router = useRouter();
const vibeId = computed(() => Number(route.params.id));

// ── Data ──────────────────────────────────────────────────────────────────────

const { vibes, selectedVibe, fetchVibe } = useVibes();
const { vibeSounds, fetchVibeSounds }    = useVibeSounds();
const { executionPlan, buildPlan, clearPlan } = usePlayerEngine();
const {
  playbackState,
  elapsedSeconds,
  playPlan,
  pauseAll,
  resumeAll,
  stopAll,
  restartPlan,
  beginSessionClock,
  pauseElapsedTicker,
  resumeElapsedTicker,
  setCurrentVibe,
} = useAudioPlayer();

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
    const totalLayers     = executionPlan.value.length;
    const playableCount   = playableLayers.value.length;
    const started         = playPlan(executionPlan.value);

    if (!started) {
      await showPlaybackToast(
        playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
      );
      return;
    }

    if (playableCount < totalLayers) {
      await showPlaybackToast('Some sounds could not be played');
    }

    // Publish context so the MiniPlayer can display this vibe when user navigates away.
    const soundCount = vibeSounds.value.length;
    setCurrentVibe(
      vibeId.value,
      vibe.value?.name ?? '',
      `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
    );

    beginSessionClock();
  } else if (playbackState.value === 'playing') {
    pauseAll();
    pauseElapsedTicker();
  } else {
    resumeAll();
    resumeElapsedTicker();
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
  const started       = restartPlan(executionPlan.value);

  if (!started) {
    await showPlaybackToast(
      playableCount === 0 ? 'No playable sounds available' : 'Some sounds could not be played',
    );
    return;
  }

  if (playableCount < totalLayers) {
    await showPlaybackToast('Some sounds could not be played');
  }

  // Keep vibe context current after restart.
  const soundCount = vibeSounds.value.length;
  setCurrentVibe(
    vibeId.value,
    vibe.value?.name ?? '',
    `${soundCount} sound${soundCount !== 1 ? 's' : ''}`,
  );

  beginSessionClock();
}

function handleStopVibe(): void {
  stopAll();
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
</style>
