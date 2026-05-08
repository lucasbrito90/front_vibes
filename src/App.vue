<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';

import { useAppLifecycleAudio } from '@/composables/useAppLifecycleAudio';

/*
 * Register the Capacitor appStateChange listener for the full app lifetime.
 * Placing it here (root component, never unmounted) guarantees it is
 * registered exactly once regardless of navigation or route changes.
 */
useAppLifecycleAudio();
</script>
