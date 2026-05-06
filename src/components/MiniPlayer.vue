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
   * Sits directly above the 56px tab bar.
   * The tab bar itself adds env(safe-area-inset-bottom) internally,
   * so this fixed position accounts for it.
   */
  bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  z-index: 200;

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 62px;

  background: rgba(15, 15, 22, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.35);

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
  color: #fff;
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
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── State dot ───────────────────────────────────────────── */
.mini-player-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transition: background 0.3s;
}

.mini-player-dot--playing {
  background: #4ade80;
  box-shadow: 0 0 5px rgba(74, 222, 128, 0.65);
}

.mini-player-dot--paused {
  background: #fbbf24;
  box-shadow: 0 0 5px rgba(251, 191, 36, 0.50);
}

/* ── Controls ────────────────────────────────────────────── */
.mini-player-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mini-player-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}

.mini-player-btn:active {
  transform: scale(0.90);
  background: rgba(255, 255, 255, 0.18);
}

.mini-player-btn--stop {
  color: rgba(255, 100, 100, 0.85);
}

.mini-player-btn--stop:active {
  background: rgba(255, 100, 100, 0.15);
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
