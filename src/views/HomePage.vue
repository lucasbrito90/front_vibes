<template>
  <ion-page class="home-page">
    <ion-content class="home-content" :fullscreen="true">
      <div class="auth-screen">
        <h1 class="auth-title">Home</h1>
        <p class="auth-subtitle">
          Authenticated as:
          <strong>{{ currentUser?.email ?? 'No email' }}</strong>
        </p>
        <ion-button class="auth-submit" expand="block" router-link="/vibes">
          My Vibes
        </ion-button>
        <ion-button class="auth-submit" expand="block" fill="outline" @click="handleLogout">
          Logout
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import { useAuth } from '@/composables/useAuth';

const { currentUser, logout } = useAuth();

async function handleLogout() {
  try {
    await logout();
    window.location.replace('/sign-in');
  } catch {
    // ignore logout errors
  }
}
</script>
