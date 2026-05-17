<template>
  <ion-page class="auth-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar">
        <ion-buttons slot="start">
          <ion-button class="auth-icon-button" fill="clear" @click="router.push('/sign-in')">
            <ion-icon class="auth-back-button" :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">Reset password</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="auth-content">
      <div class="auth-screen auth-flow-body auth-screen-forgot">
        <p class="auth-subtitle auth-flow-lead">
          Enter your email and we’ll send a link to reset your password.
        </p>

        <form class="auth-form auth-forgot-form" @submit.prevent="handleSendResetEmail">
          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="email"
              type="email"
              autocomplete="email"
              inputmode="email"
              placeholder="Email"
              required
            />
          </ion-item>

          <ion-button class="auth-submit auth-forgot-submit" expand="block" type="submit" :disabled="loading">
            Send email
          </ion-button>
        </form>

        <ion-text v-if="error" class="auth-error">{{ error }}</ion-text>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBackOutline } from 'ionicons/icons';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const { requestPasswordReset, loading, error } = useAuth();
const email = ref('');

async function handleSendResetEmail() {
  await requestPasswordReset(email.value);
  await router.replace('/reset-password-success');
}
</script>
