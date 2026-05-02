<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="settings-toolbar">
        <ion-title class="settings-title">Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="settings-content">
      <div class="settings-placeholder">
        <ion-icon :icon="settingsOutline" class="settings-icon" />
        <p class="settings-placeholder-title">Settings</p>
        <p class="settings-placeholder-sub">Coming soon</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { settingsOutline } from 'ionicons/icons';
</script>

<style scoped>
.settings-toolbar {
  --background: var(--app-color-bg, #0f172a);
  --border-style: none;
  padding-top: 4px;
}

.settings-title {
  font-size: var(--app-font-size-h6, 18px);
  font-weight: var(--app-font-weight-bold, 700);
  color: var(--app-color-text-primary, #f1f5f9);
}

.settings-content {
  --background: var(--app-color-bg, #0f172a);
}

.settings-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 24px;
  text-align: center;
}

.settings-icon {
  font-size: 48px;
  color: rgba(148, 163, 184, 0.35);
}

.settings-placeholder-title {
  font-size: var(--app-font-size-h6, 18px);
  font-weight: var(--app-font-weight-semibold, 600);
  color: var(--app-color-text-primary, #f1f5f9);
  margin: 0;
}

.settings-placeholder-sub {
  font-size: var(--app-font-size-body-md, 14px);
  color: var(--app-color-text-secondary, #94a3b8);
  margin: 0;
}
</style>
