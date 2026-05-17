<template>
  <ion-page class="auth-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar">
        <ion-buttons slot="start">
          <ion-button class="auth-icon-button" fill="clear" @click="router.push('/sign-in')">
            <ion-icon class="auth-back-button" :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">Sign up</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="auth-content">
      <div class="auth-screen auth-flow-body auth-screen-signup app-slide-up">
        <p class="auth-subtitle auth-flow-lead">
          Create your Ixora account to save and layer vibes.
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
          <span>Or sign up with email</span>
        </div>

        <form class="auth-form" @submit.prevent="handleEmailSignUp">
          <ion-item class="auth-item" lines="none">
            <ion-input v-model="name" type="text" autocomplete="name" placeholder="Name" required />
          </ion-item>

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
              autocomplete="new-password"
              placeholder="Password"
              required
            />
            <ion-button slot="end" fill="clear" type="button" @click.prevent="showPassword = !showPassword">
              <ion-icon :icon="eyeOffOutline" />
            </ion-button>
          </ion-item>

          <ion-button class="auth-submit" expand="block" type="submit" :disabled="loading">
            Create account
          </ion-button>
        </form>

        <ion-text v-if="error" class="auth-error">{{ error }}</ion-text>

        <p class="auth-footer">
          Already have an account?
          <router-link to="/sign-in">Sign in</router-link>
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

const { signUpWithEmail, loginWithGoogle, loading, error } = useAuth();

const name = ref('');
const email = ref('');
const password = ref('');
const showPassword = ref(false);

async function handleGoogleLogin() {
  try {
    await loginWithGoogle();
    window.location.replace('/home');
  } catch {
    /* error surfaced via useAuth */
  }
}

async function handleEmailSignUp() {
  try {
    await signUpWithEmail(email.value, password.value, name.value || undefined);

    window.location.replace('/home');
  } catch {
    /* error surfaced via useAuth */
  }
}
</script>
