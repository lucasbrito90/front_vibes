<template>
  <ion-page class="auth-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar">
        <ion-buttons slot="start">
          <ion-button class="auth-icon-button" fill="clear" @click="goBack">
            <ion-icon class="auth-back-button" :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">Sign in</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="auth-content">
      <div class="auth-screen auth-flow-body app-slide-up">
        <p class="auth-subtitle auth-flow-lead">
          Use the same method you signed up with.
        </p>

        <div class="auth-social-group">
          <ion-button class="auth-social-button" fill="clear" disabled>
            <span class="auth-social-inner">
              <span class="auth-social-icon-wrap">
                <ion-icon class="auth-social-apple-icon" :icon="logoApple" />
              </span>
              <span>Continue with Apple</span>
            </span>
          </ion-button>
          <ion-button class="auth-social-button" fill="clear" @click="handleGoogleLogin">
            <span class="auth-social-inner">
              <span class="auth-social-icon-wrap">
                <img class="auth-social-google-icon" src="@/assets/google-icon.svg" alt="Google" />
              </span>
              <span>Continue with Google</span>
            </span>
          </ion-button>
        </div>

        <div class="auth-divider">
          <span>Or continue with email</span>
        </div>

        <form class="auth-form" @submit.prevent="handleEmailLogin">
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

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Password"
              required
            />
            <ion-button slot="end" fill="clear" type="button" @click.prevent="showPassword = !showPassword">
              <ion-icon :icon="eyeOffOutline" />
            </ion-button>
          </ion-item>

          <ion-button class="auth-submit" expand="block" type="submit" :disabled="loading">
            Sign in
          </ion-button>
        </form>

        <ion-text v-if="error" class="auth-error">{{ error }}</ion-text>
        <router-link class="auth-link" to="/forgot-password">Forgot password?</router-link>

        <p class="auth-footer">
          Don’t have an account?
          <router-link to="/sign-up">Sign up</router-link>
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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
import { chevronBackOutline, eyeOffOutline, logoApple } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const { loginWithEmail, loginWithGoogle, loading, error } = useAuth();

const email = ref('');
const password = ref('');
const showPassword = ref(false);

function goBack(): void {
  void router.replace('/sign-in-sign-up');
}

async function handleGoogleLogin() {
  try {
    await loginWithGoogle();
    window.location.replace('/home');
  } catch {
    /* error surfaced via useAuth */
  }
}

async function handleEmailLogin() {
  try {
    await loginWithEmail(email.value, password.value);
    window.location.replace('/home');
  } catch {
    /* error surfaced via useAuth */
  }
}
</script>
