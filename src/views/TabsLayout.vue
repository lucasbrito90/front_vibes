<template>
  <!--
    ion-page is required at the root of the tabs layout.
    Without it, Ionic's view transition system cannot find the page
    boundary and logs the "does not have the required <ion-page>" warning
    on every tab switch. This matches the official Ionic Vue starter pattern.

    When the mini player is visible, --app-mini-player-height is set to 68px
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

        <ion-tab-button tab="presets" href="/presets" class="app-tab-btn">
          <ion-icon :icon="albumsOutline" class="app-tab-icon" />
          <ion-label>Presets</ion-label>
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
import { homeOutline, albumsOutline, musicalNotesOutline, settingsOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { storeToRefs } from 'pinia';
import MiniPlayer from '@/components/MiniPlayer.vue';
import { usePlayerStore } from '@/stores/player.store';

const route = useRoute();
const { showMiniPlayer } = storeToRefs(usePlayerStore());

/** Must match the `height` in MiniPlayer.vue. */
const MINI_PLAYER_HEIGHT = 68; // px
const TAB_BAR_HEIGHT     = 56; // px

/**
 * CSS variables cascaded from the root ion-page to all descendants:
 *
 * --app-tab-bar-height        Always 56px — lets MiniPlayer reference it.
 * --app-mini-player-height    68px when mini player is actually visible,
 *                             0px when idle OR when the route hides it.
 *                             Used by the global --padding-bottom rule below
 *                             so only routes that show the mini player get
 *                             the extra scroll clearance.
 */
const miniPlayerCssVar = computed(() => {
  const isVisible = showMiniPlayer.value && !route.meta.hideMiniPlayer;
  const h = isVisible ? MINI_PLAYER_HEIGHT : 0;
  return {
    '--app-tab-bar-height':    `${TAB_BAR_HEIGHT}px`,
    '--app-mini-player-height': `${h}px`,
  };
});
</script>

<!--
  Global (non-scoped): add bottom scroll-clearance equal to the mini player
  height. --app-mini-player-height is 0px when idle or when the route sets
  hideMiniPlayer:true, so the extra padding only applies on routes where the
  mini player is actually rendered. Ionic's own --offset-bottom already covers
  the tab bar height (56px); this adds only the mini player height on top.
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
  /*
   * height: 56px is the visual content height.
   * Safe-area padding for the home indicator is handled internally by
   * Ionic's ion-tab-bar shadow DOM (--ion-safe-area-bottom), so we do NOT
   * add padding-bottom here to avoid double-counting that would push the
   * mini player above the tab bar on notched devices.
   */
  height: 56px;
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
