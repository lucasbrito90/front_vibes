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
            :class="{ 'player-control-btn--disabled': !hasLoopSounds }"
            :disabled="!hasLoopSounds"
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
          <!-- Warning (no sounds / no loop sounds) -->
          <p v-if="!loading && warningText" class="player-warning">
            {{ warningText }}
          </p>

          <p class="player-label">AMBIENT MIX</p>
          <h1 class="player-title">{{ vibe?.name ?? '…' }}</h1>
          <p class="player-sounds-text">{{ soundsSummary }}</p>

          <div class="player-status-row">
            <span
              class="player-status-dot"
              :class="{ 'player-status-dot--active': playbackState === 'playing' }"
            />
            <span class="player-status-text">{{ statusText }}</span>
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
} = useAudioPlayer();

const menuTriggerId = computed(() => `vibe-player-menu-${vibeId.value}`);

const loading = ref(false);

// Prefer the already-loaded vibe from the list; fall back to selectedVibe
const vibe = computed(() =>
  vibes.value.find((v) => v.id === vibeId.value)
  ?? (selectedVibe.value?.id === vibeId.value ? selectedVibe.value : null),
);

// ── Execution plan helpers ────────────────────────────────────────────────────

const loopLayers = computed(() =>
  executionPlan.value.filter((l) => l.playMode === 'loop'),
);

const hasLoopSounds = computed(() => loopLayers.value.length > 0);

const warningText = computed((): string | null => {
  if (loading.value) return null;
  if (!vibeSounds.value.length) return 'No sounds configured';
  if (!hasLoopSounds.value) return 'No loop sounds available for Phase 1';
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
  const t = formatElapsed(elapsedSeconds.value);
  if (playbackState.value === 'playing') return `Playing • ${t}`;
  if (playbackState.value === 'paused') return `Paused • ${t}`;
  return 'Ready';
});

const centerIcon = computed(() =>
  playbackState.value === 'playing' ? pauseOutline : playOutline,
);

const centerAriaLabel = computed((): string => {
  if (playbackState.value === 'playing') return 'Pause';
  if (playbackState.value === 'paused') return 'Resume';
  return 'Play';
});

function togglePlayback(): void {
  if (!hasLoopSounds.value) return;

  if (playbackState.value === 'idle') {
    playPlan(loopLayers.value);
    beginSessionClock();
  } else if (playbackState.value === 'playing') {
    pauseAll();
    pauseElapsedTicker();
  } else {
    resumeAll();
    resumeElapsedTicker();
  }
}

function handleRestartVibe(): void {
  if (!hasLoopSounds.value) return;
  restartPlan(loopLayers.value);
  beginSessionClock();
}

function handleStopVibe(): void {
  stopAll();
}

// ── Navigation ────────────────────────────────────────────────────────────────

function handleBack(): void {
  stopAll();
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
  stopAll();
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
</style>
