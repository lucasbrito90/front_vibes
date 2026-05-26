<template>
  <Transition name="mini-player-slide">
    <div
      v-if="isVisible"
      class="mini-player"
      :class="{
        'mini-player--preparing': playbackState === 'preparing',
        'mini-player--playing': playbackState === 'playing',
        'mini-player--paused': playbackState === 'paused',
      }"
      role="region"
      aria-label="Mini Player"
      @click="navigateToPlayer"
    >
      <!-- Artwork thumbnail -->
      <div class="mini-player-artwork">
        <Transition name="mini-player-artwork" mode="out-in">
          <img
            v-if="currentVibeArtworkUrl"
            :key="artworkKey"
            :src="currentVibeArtworkUrl"
            class="mini-player-artwork-img app-artwork-fade-in"
            alt=""
            aria-hidden="true"
          />
          <div
            v-else
            :key="`placeholder-${artworkKey}`"
            class="mini-player-artwork-placeholder"
            :style="artworkGradient"
            aria-hidden="true"
          >
            <ion-icon :icon="musicalNotesOutline" class="mini-player-artwork-fallback-icon" />
          </div>
        </Transition>
      </div>

      <!-- Vibe info -->
      <div class="mini-player-info">
        <p class="mini-player-name">{{ currentVibeName }}</p>
        <p class="mini-player-meta">
          <span class="mini-player-dot" :class="dotClass" />
          {{ metaText }}
        </p>
      </div>

      <!-- Controls -->
      <div class="mini-player-controls">
        <button
          type="button"
          class="mini-player-btn"
          :class="{
            'mini-player-btn--disabled': playbackState === 'preparing',
            'mini-player-btn--pulse': playPausePulse,
          }"
          :disabled="playbackState === 'preparing'"
          :aria-label="playPauseLabel"
          @click.stop="handlePlayPause"
        >
          <Transition name="mini-player-control-icon" mode="out-in">
            <ion-spinner
              v-if="playbackState === 'preparing'"
              key="preparing-spinner"
              name="crescent"
              class="mini-player-spinner"
            />
            <ion-icon v-else key="icon" :icon="playPauseIcon" />
          </Transition>
        </button>

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
import { IonIcon, IonSpinner } from '@ionic/vue';
import {
  pauseOutline,
  playOutline,
  stopCircleOutline,
  musicalNotesOutline,
} from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';

import { usePlayerStore } from '@/stores/player.store';
import { createLogger } from '@/utils/player-debug';
import { getVibeFallbackGradient } from '@/utils/artwork';

const log = createLogger('MiniPlayer');

const route  = useRoute();
const router = useRouter();

const store = usePlayerStore();
const {
  playbackState,
  currentVibeId,
  currentVibeName,
  currentSoundSummary,
  currentVibeArtworkUrl,
  showMiniPlayer,
} = storeToRefs(store);

const playPausePulse = ref(false);

const artworkKey = computed(
  () => `${currentVibeId.value ?? 'none'}-${currentVibeArtworkUrl.value ?? 'none'}`,
);

// ── Visibility ────────────────────────────────────────────────────────────────

const isVisible = computed(
  () => !route.meta.hideMiniPlayer && showMiniPlayer.value,
);

watch(isVisible, (next, prev) => {
  log.debug(`visibility ${String(prev)} → ${String(next)}`, {
    playbackState:  playbackState.value,
    currentVibeId:  currentVibeId.value,
    routeName:      String(route.name ?? route.path),
    hideMiniPlayer: !!route.meta.hideMiniPlayer,
  });
});

// ── Artwork placeholder gradient ──────────────────────────────────────────────
// When no artwork URL is available, derive a gradient from the vibe ID so each
// vibe always gets a consistent colour rather than a generic grey box.

const artworkGradient = computed(() => ({
  background: getVibeFallbackGradient(currentVibeId.value ?? 0),
}));

// ── Display text ──────────────────────────────────────────────────────────────

const stateLabel = computed(() => {
  if (playbackState.value === 'preparing') return 'Starting';
  return playbackState.value === 'playing' ? 'Playing' : 'Paused';
});

const metaText = computed(() => {
  const base = currentSoundSummary.value;
  if (playbackState.value === 'preparing') {
    const layerHint = base || 'ambient mix';
    return `${layerHint} • Starting playback…`;
  }
  return base ? `${base} • ${stateLabel.value}` : stateLabel.value;
});

// ── Dot styling ───────────────────────────────────────────────────────────────

const dotClass = computed(() => ({
  'mini-player-dot--preparing': playbackState.value === 'preparing',
  'mini-player-dot--playing': playbackState.value === 'playing',
  'mini-player-dot--paused': playbackState.value === 'paused',
}));

// ── Controls ──────────────────────────────────────────────────────────────────

const playPauseIcon = computed(() =>
  playbackState.value === 'playing' ? pauseOutline : playOutline,
);

const playPauseLabel = computed(() => {
  if (playbackState.value === 'preparing') return 'Starting playback';
  return playbackState.value === 'playing' ? 'Pause' : 'Resume';
});

watch(playbackState, (next, prev) => {
  const toggled =
    (next === 'playing' && prev === 'paused')
    || (next === 'paused' && prev === 'playing');
  if (!toggled) return;
  playPausePulse.value = false;
  window.requestAnimationFrame(() => {
    playPausePulse.value = true;
    window.setTimeout(() => {
      playPausePulse.value = false;
    }, 450);
  });
});

function handlePlayPause(): void {
  if (playbackState.value === 'preparing') return;
  if (playbackState.value === 'playing') {
    log.debug('pause tapped');
    store.pausePlayback();
  } else {
    log.debug('resume tapped');
    store.resumePlayback();
  }
}

function handleStop(): void {
  log.debug('stop tapped');
  store.stopPlayback();
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
   * Sits directly above the tab bar.
   * --app-tab-bar-height (56px) is injected by TabsLayout so this value is
   * always in sync with the actual tab bar height. env(safe-area-inset-bottom)
   * accounts for the home-indicator area on notched devices.
   * Height 68px must match MINI_PLAYER_HEIGHT in TabsLayout.vue.
   */
  bottom: calc(var(--app-tab-bar-height, 56px) + env(safe-area-inset-bottom, 0px));
  z-index: 200;
  height: 68px;

  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;

  /* Dark glass — premium feel */
  background: rgba(12, 12, 20, 0.86);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 -4px 24px rgba(0, 0, 0, 0.38),
    0 -1px 0   rgba(255, 255, 255, 0.06);

  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mini-player--preparing {
  box-shadow:
    0 -4px 24px rgba(0, 0, 0, 0.38),
    0 -1px 0 rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(56, 189, 248, 0.12);
}

.mini-player--playing {
  box-shadow:
    0 -4px 24px rgba(0, 0, 0, 0.38),
    0 -1px 0 rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(74, 222, 128, 0.1);
}

.mini-player--paused {
  box-shadow:
    0 -4px 24px rgba(0, 0, 0, 0.38),
    0 -1px 0 rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(251, 191, 36, 0.1);
}

/* ── Artwork thumbnail ───────────────────────────────────── */
.mini-player-artwork {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.mini-player-artwork-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mini-player-artwork-placeholder {
  width: 100%;
  height: 100%;
  position: relative;
}

.mini-player-artwork-fallback-icon {
  position: absolute;
  bottom: 3px;
  right: 3px;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.38);
  pointer-events: none;
}

.mini-player-artwork-enter-active,
.mini-player-artwork-leave-active {
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.mini-player-artwork-enter-from,
.mini-player-artwork-leave-to {
  opacity: 0;
  transform: scale(0.94);
}

.mini-player-control-icon-enter-active,
.mini-player-control-icon-leave-active {
  transition:
    opacity var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.mini-player-control-icon-enter-from,
.mini-player-control-icon-leave-to {
  opacity: 0;
  transform: scale(0.82);
}

/* ── Info area ───────────────────────────────────────────── */
.mini-player-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mini-player-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.1px;
}

.mini-player-meta {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.52);
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
  background: rgba(255, 255, 255, 0.22);
  transition: background 0.3s;
}

.mini-player-dot--playing {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.65);
}

.mini-player-dot--paused {
  background: #fbbf24;
  box-shadow: 0 0 5px rgba(251, 191, 36, 0.50);
}

.mini-player-dot--preparing {
  background: #38bdf8;
  box-shadow: 0 0 5px rgba(56, 189, 248, 0.55);
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
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  transition:
    background var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-standard),
    opacity var(--app-motion-fast) var(--app-ease-standard);
  -webkit-tap-highlight-color: transparent;

  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.90);
}

.mini-player-btn:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.20);
}

.mini-player-btn--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.mini-player-btn--pulse {
  animation: mini-player-btn-pulse 0.45s var(--app-ease-emphasized);
}

@keyframes mini-player-btn-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

.mini-player-spinner {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.85);
}

/* Stop button — subtle danger surface */
.mini-player-btn--stop {
  background: rgba(247, 85, 85, 0.12);
  color: rgba(255, 120, 120, 0.90);
}

.mini-player-btn--stop:active {
  background: rgba(247, 85, 85, 0.24);
  transform: scale(0.92);
}

/* ── Slide-up / slide-down transition ───────────────────── */
.mini-player-slide-enter-active,
.mini-player-slide-leave-active {
  transition:
    transform var(--app-motion-slow) var(--app-ease-emphasized),
    opacity var(--app-motion-base) var(--app-ease-standard);
}

.mini-player-slide-enter-from,
.mini-player-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
