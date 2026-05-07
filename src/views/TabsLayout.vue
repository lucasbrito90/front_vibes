<template>
  <!--
    ion-page is required at the root of the tabs layout.
    Without it, Ionic's view transition system cannot find the page
    boundary and logs the "does not have the required <ion-page>" warning
    on every tab switch. This matches the official Ionic Vue starter pattern.

    When the mini player is visible, --app-mini-player-height is set to 62px
    so that child ion-content elements can add bottom padding via:
      --padding-bottom: var(--app-mini-player-height, 0px)
    (applied globally in the non-scoped <style> block below).
  -->
  <ion-page :style="miniPlayerCssVar">
    <ion-tabs>
      <ion-router-outlet />

      <!-- Mini player rendered here but positioned fixed above the tab bar -->
      <MiniPlayer />

      <ion-tab-bar slot="bottom" class="app-tab-bar">
        <ion-tab-button tab="home" href="/home" class="app-tab-btn">
          <ion-icon :icon="homeOutline" class="app-tab-icon" />
          <ion-label>Home</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="vibes" href="/vibes" class="app-tab-btn">
          <ion-icon :icon="musicalNotesOutline" class="app-tab-icon" />
          <ion-label>My Vibes</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="settings" href="/settings" class="app-tab-btn">
          <ion-icon :icon="settingsOutline" class="app-tab-icon" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
} from '@ionic/vue';
import { homeOutline, musicalNotesOutline, settingsOutline } from 'ionicons/icons';
import { computed } from 'vue';

import MiniPlayer from '@/components/MiniPlayer.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';

const { playbackState } = useAudioPlayer();

/** Height of the mini player bar injected as a CSS custom property so that
 *  child ion-content elements can offset their bottom padding. */
/** Height of the mini player bar. Must match the `height` in MiniPlayer.vue. */
const MINI_PLAYER_HEIGHT = 62; // px

/** Height of the tab bar visible content (without safe area). */
const TAB_BAR_HEIGHT = 56; // px

/**
 * CSS variables injected on the root ion-page so any descendant can access:
 *
 * --app-mini-player-height   62px when playing/paused, 0px when idle.
 *
 * --app-mini-player-bottom-offset
 *   Full offset from the viewport bottom to use as `bottom:` for any
 *   fixed element that must sit above both the tab bar AND the mini player.
 *   = tab-bar-height + safe-area-inset-bottom + mini-player-height
 *   When mini player is hidden this collapses to tab-bar + safe-area,
 *   so the element sits just above the tab bar.
 */
const miniPlayerCssVar = computed(() => {
  const h = playbackState.value !== 'idle' ? MINI_PLAYER_HEIGHT : 0;
  return {
    '--app-mini-player-height': `${h}px`,
    '--app-mini-player-bottom-offset':
      `calc(${TAB_BAR_HEIGHT}px + var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px)) + ${h}px)`,
  };
});
</script>

<!--
  Global (non-scoped): offset ion-content bottom padding so scrollable pages
  are not obscured by the mini player. The CSS custom property is set on the
  ancestor ion-page by the computed style binding above and cascades down.
-->
<style>
ion-content {
  --padding-bottom: var(--app-mini-player-height, 0px);
}
</style>

<style scoped>
.app-tab-bar {
  --background: var(--app-color-bg, #ffffff);
  --color: var(--app-color-text-muted, #94a3b8);
  --color-selected: var(--ion-color-primary, #1dac92);
  border-top: 1px solid var(--app-color-border, #cbd5e1);
  height: 56px;
  padding-bottom: env(safe-area-inset-bottom);
}

.app-tab-btn {
  --ripple-color: transparent;
  letter-spacing: 0.2px;
}

.app-tab-btn ion-label {
  font-size: 10px;
  font-weight: 500;
  margin-top: 3px;
}

.app-tab-icon {
  font-size: 22px;
}
</style>
