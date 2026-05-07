<template>
  <Transition name="mini-player-slide">
    <div
      v-if="isVisible"
      class="mini-player"
      role="region"
      aria-label="Mini Player"
      @click="navigateToPlayer"
    >
      <!-- Left: vibe info -->
      <div class="mini-player-info">
        <p class="mini-player-name">{{ currentVibeName }}</p>
        <p class="mini-player-meta">
          <span class="mini-player-dot" :class="dotClass" />
          {{ metaText }}
        </p>
      </div>

      <!-- Right: controls -->
      <div class="mini-player-controls">
        <!-- Play / Pause -->
        <button
          type="button"
          class="mini-player-btn"
          :aria-label="playPauseLabel"
          @click.stop="handlePlayPause"
        >
          <ion-icon :icon="playPauseIcon" />
        </button>

        <!-- Stop -->
        <button
          type="button"
          class="mini-player-btn mini-player-btn--stop"
          aria-label="Stop"
          @click.stop="handleStop"
        >
          <ion-icon :icon="stopCircleOutline" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import {
  pauseOutline,
  playOutline,
  stopCircleOutline,
} from 'ionicons/icons';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useAudioPlayer } from '@/composables/useAudioPlayer';

const router = useRouter();

const {
  playbackState,
  currentVibeId,
  currentVibeName,
  currentSoundSummary,
  pauseAll,
  resumeAll,
  stopAll,
  pauseElapsedTicker,
  resumeElapsedTicker,
} = useAudioPlayer();

// ── Visibility ────────────────────────────────────────────────────────────────

const isVisible = computed(
  () =>
    currentVibeId.value !== null
    && (playbackState.value === 'playing' || playbackState.value === 'paused'),
);

// ── Display text ──────────────────────────────────────────────────────────────

const stateLabel = computed(() =>
  playbackState.value === 'playing' ? 'Playing' : 'Paused',
);

const metaText = computed(() => {
  const base = currentSoundSummary.value;
  return base ? `${base} • ${stateLabel.value}` : stateLabel.value;
});

// ── Dot styling ───────────────────────────────────────────────────────────────

const dotClass = computed(() => ({
  'mini-player-dot--playing': playbackState.value === 'playing',
  'mini-player-dot--paused':  playbackState.value === 'paused',
}));

// ── Controls ──────────────────────────────────────────────────────────────────

const playPauseIcon = computed(() =>
  playbackState.value === 'playing' ? pauseOutline : playOutline,
);

const playPauseLabel = computed(() =>
  playbackState.value === 'playing' ? 'Pause' : 'Resume',
);

function handlePlayPause(): void {
  if (playbackState.value === 'playing') {
    pauseAll();
    pauseElapsedTicker();
  } else {
    resumeAll();
    resumeElapsedTicker();
  }
}

function handleStop(): void {
  stopAll();
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigateToPlayer(): void {
  if (currentVibeId.value === null) return;
  router.push(`/vibes/${currentVibeId.value}/player`);
}
</script>

<style scoped>
/* ── Mini Player bar ─────────────────────────────────────── */
.mini-player {
  position: fixed;
  left: 0;
  right: 0;
  /*
   * Positioned immediately above the tab bar.
   * Uses Ionic's --ion-safe-area-bottom (set by Capacitor/Cordova on device)
   * with env() as fallback so it stays flush on both browser and native.
   * Height 62px must match MINI_PLAYER_HEIGHT in TabsLayout.vue.
   */
  bottom: calc(56px + var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px)));
  z-index: 200;
  height: 62px;

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;

  background: var(--app-color-bg, #ffffff);
  border-top: 1px solid var(--app-color-border, #cbd5e1);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);

  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ── Info area ───────────────────────────────────────────── */
.mini-player-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mini-player-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--app-color-text-primary, #121826);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-player-meta {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--app-color-text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── State dot ───────────────────────────────────────────── */
.mini-player-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-color-border, #cbd5e1);
  transition: background 0.3s;
}

.mini-player-dot--playing {
  background: var(--ion-color-success, #64c086);
  box-shadow: 0 0 5px rgba(100, 192, 134, 0.55);
}

.mini-player-dot--paused {
  background: var(--ion-color-warning, #facc15);
  box-shadow: 0 0 4px rgba(250, 204, 21, 0.45);
}

/* ── Controls ────────────────────────────────────────────── */
.mini-player-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mini-player-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  font-size: 19px;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;

  /* Play / pause — primary colour */
  background: var(--ion-color-primary, #1dac92);
  color: #ffffff;
}

.mini-player-btn:active {
  transform: scale(0.90);
  background: var(--ion-color-primary-shade, #1a987f);
}

/* Stop button — subtle danger surface */
.mini-player-btn--stop {
  background: rgba(247, 85, 85, 0.10);
  color: var(--ion-color-danger, #f75555);
}

.mini-player-btn--stop:active {
  background: rgba(247, 85, 85, 0.20);
  transform: scale(0.90);
}

/* ── Slide-up / slide-down transition ───────────────────── */
.mini-player-slide-enter-active,
.mini-player-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              opacity   0.22s ease;
}

.mini-player-slide-enter-from,
.mini-player-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
