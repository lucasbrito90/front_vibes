<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';

import { useAppLifecycleAudio } from '@/composables/useAppLifecycleAudio';
import { useScheduleNotificationHandler } from '@/composables/useScheduleNotificationHandler';
import { initAudioFocusService } from '@/services/audio-focus.service';
import { scheduleNotificationService } from '@/services/schedule-notification.service';
import { pushTokenService } from '@/services/push-token.service';

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

/*
 * Create the Android schedule-reminders notification channel once at startup.
 * No-op on web / non-native platforms.
 */
void scheduleNotificationService.initialize();

/*
 * Register the schedule notification tap handler. When a schedule notification
 * is tapped, the handler navigates to /vibes/:vibe_id/player — user must press
 * Play manually (no auto-play, per ADR-011).
 */
useScheduleNotificationHandler();

/*
 * Register the FCM token-rotation listener exactly once at app startup.
 * When Firebase rotates the device token, the listener calls
 * POST /api/push-tokens/refresh to keep the backend record current.
 * No-op on web / non-native platforms.
 */
pushTokenService.initPushTokenRefreshListener();
</script>
