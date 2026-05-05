<template>
  <!--
    ion-page is required at the root of the tabs layout.
    Without it, Ionic's view transition system cannot find the page
    boundary and logs the "does not have the required <ion-page>" warning
    on every tab switch. This matches the official Ionic Vue starter pattern.
  -->
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />

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
</script>

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
