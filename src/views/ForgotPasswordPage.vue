<template>
  <ion-page class="auth-page">
    <ion-content class="auth-content" :fullscreen="true">
      <div class="auth-screen auth-screen-forgot">
        <ion-button class="auth-icon-button" fill="clear" @click="router.push('/sign-in')">
          <ion-icon class="auth-back-button" :icon="chevronBackOutline" />
        </ion-button>

        <h1 class="auth-title auth-forgot-title">Forgotten Password</h1>
        <p class="auth-subtitle auth-forgot-subtitle">
          Please enter an email address that you used to create account with so we can send you an email to reset your
          password.
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
import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonPage, IonText } from '@ionic/vue';
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
