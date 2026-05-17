<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';

import { useAppLifecycleAudio } from '@/composables/useAppLifecycleAudio';
import { initAudioFocusService } from '@/services/audio-focus.service';

/*
 * Register the Capacitor appStateChange listener for the full app lifetime.
 * Placing it here (root component, never unmounted) guarantees it is
 * registered exactly once regardless of navigation or route changes.
 */
useAppLifecycleAudio();

/*
 * Register the headset/Bluetooth disconnect listener (AUDIO_BECOMING_NOISY).
 * Safe to call multiple times — initAudioFocusService() is idempotent.
 */
initAudioFocusService();
</script>
