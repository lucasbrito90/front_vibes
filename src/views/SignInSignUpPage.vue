<template>
  <ion-page class="auth-page">
    <ion-content class="auth-content">
      <div class="auth-screen auth-entry-screen app-fade-in">
        <section class="auth-entry-hero">
          <img
            class="auth-entry-hero-image"
            src="https://www.figma.com/api/mcp/asset/139068fd-60aa-45ea-a41f-059245c61f1a"
            alt="Ixora ambient hero"
          />
          <div class="auth-entry-hero-overlay">
            <h1>IXORA</h1>
            <p>Layer ambient sound. Find your vibe.</p>
          </div>
        </section>

        <div class="auth-entry-buttons">
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

          <ion-button class="auth-submit auth-entry-email-button" expand="block" router-link="/sign-in">
            <span class="auth-entry-email-inner">
              <ion-icon :icon="mailOutline" />
              Continue with email
            </span>
          </ion-button>
        </div>

        <p class="auth-entry-footer">
          Not a member?
          <router-link to="/sign-up">Sign up</router-link>
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/vue';
import { logoApple, mailOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const { loginWithGoogle } = useAuth();

async function handleGoogleLogin() {
  await loginWithGoogle();
  await router.replace('/home');
}
</script>
