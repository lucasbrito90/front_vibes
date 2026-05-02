<template>
  <ion-page class="auth-page">
    <ion-content class="auth-content" :fullscreen="true">
      <div class="auth-screen auth-success-screen">
        <img
          class="auth-success-illustration"
          src="https://www.figma.com/api/mcp/asset/4be3c147-ae4e-423b-81d5-e7b7a9c96b37"
          alt="Success illustration"
        />

        <h1 class="auth-title auth-success-title">Success!</h1>
        <p class="auth-subtitle auth-success-subtitle">
          We sent a password reset link.
          <br />
          Check your email inbox to reset your password.
        </p>

        <ion-button class="auth-submit auth-success-submit" expand="block" @click="router.replace('/sign-in')">
          OK
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import { useRouter } from 'vue-router';

const router = useRouter();
</script>
