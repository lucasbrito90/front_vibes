<template>
  <ion-page class="tab-page home-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>Home</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="home-ion-content" :fullscreen="true">
      <div class="page-shell page-content home-inner">
        <AppLoadingState
          v-if="vibesListLoading && !vibes.length && !vibesListError"
          compact
          title="Loading…"
          description="Fetching your vibes"
        />

        <AppErrorState
          v-else-if="vibesListError && !vibes.length"
          compact
          title="Couldn’t load your vibes"
          :description="vibesListError"
          retry-label="Try again"
          @retry="fetchVibes"
        />

        <template v-else>
          <div class="home-main app-slide-up">
          <p class="home-greeting">{{ greeting }}</p>
          <p v-if="displayName" class="home-name">{{ displayName }}</p>
          <p v-if="emailHint" class="home-email">{{ emailHint }}</p>

          <AppEmptyState
            v-if="!vibes.length"
            variant="card"
            class="home-onboarding app-scale-in"
            :icon="sparklesOutline"
            title="Create your first vibe"
            description="Layer ambient sounds into a mix you can play anywhere — online or offline after download."
            action-label="New vibe"
            @action="goCreateVibe"
          />

          <template v-else>
            <router-link
              v-if="continueVibe"
              class="home-continue-card app-card-enter app-pressable"
              :style="continueCardStyle"
              to="/vibes"
            >
              <div class="home-continue-scrim" aria-hidden="true" />
              <div class="home-continue-inner">
                <div class="home-continue-copy">
                  <span class="home-continue-label">Continue your vibe</span>
                  <span class="home-continue-sub">Open My Vibes and pick up where you left off</span>
                </div>
                <ion-icon :icon="chevronForwardOutline" class="home-continue-chevron" />
              </div>
            </router-link>
          </template>

          <div class="home-actions">
            <ion-button expand="block" class="home-btn-primary app-pressable" router-link="/vibes">
              My Vibes
            </ion-button>
            <ion-button expand="block" fill="outline" class="home-btn-outline app-pressable" router-link="/scenes">
              Scenes
            </ion-button>
            <ion-button expand="block" fill="outline" class="home-btn-outline app-pressable" router-link="/settings">
              Settings
            </ion-button>
          </div>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue';
import { chevronForwardOutline, sparklesOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useVibes } from '@/composables/useVibes';
import { getVibeCardBackgroundStyle } from '@/utils/artwork';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';

const router = useRouter();
const { currentUser } = useAuth();
const { vibes, vibesListLoading, vibesListError, fetchVibes } = useVibes();

const continueVibe = computed(
  () => vibes.value.find((v) => v.is_active) ?? vibes.value[0] ?? null,
);

const continueCardStyle = computed(() => {
  const v = continueVibe.value;
  if (!v) return {};
  return getVibeCardBackgroundStyle(v, 0);
});

onIonViewWillEnter(() => {
  void fetchVibes();
});

function goCreateVibe(): void {
  router.push('/vibes/create');
}

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
});

const displayName = computed(() => {
  const n = currentUser.value?.displayName?.trim();
  return n || '';
});

const emailHint = computed(() => {
  const e = currentUser.value?.email;
  return e ?? '';
});
</script>

<style scoped>
.home-page {
  --background: var(--app-color-bg);
}

.home-ion-content {
  --background: var(--app-color-surface-subtle);
}

.home-inner {
  padding-top: var(--app-space-4);
}

.home-main {
  display: block;
}

.home-greeting {
  margin: 0;
  font-size: var(--app-font-size-body-sm);
  font-weight: var(--app-font-weight-medium);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--app-color-text-muted);
}

.home-name {
  margin: var(--app-space-2) 0 0;
  font-size: var(--app-font-size-h4);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
  line-height: var(--app-line-height-heading-tight);
}

.home-email {
  margin: var(--app-space-2) 0 0;
  font-size: var(--app-font-size-body-md);
  color: var(--app-color-text-secondary);
  word-break: break-all;
}

.home-onboarding {
  margin-top: var(--app-space-7);
}

.home-continue-card {
  margin-top: var(--app-space-7);
  display: block;
  position: relative;
  overflow: hidden;
  border-radius: var(--app-radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: var(--app-shadow-card);
  text-decoration: none;
  color: inherit;
  min-height: 104px;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.home-continue-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    rgba(0, 0, 0, 0.58) 0%,
    rgba(0, 0, 0, 0.22) 52%,
    rgba(0, 0, 0, 0.48) 100%
  );
}

.home-continue-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  padding: var(--app-space-5) var(--app-space-5);
  min-height: 104px;
  box-sizing: border-box;
}

.home-continue-card:active {
  transform: scale(0.99);
}

.home-continue-copy {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  min-width: 0;
}

.home-continue-label {
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-bold);
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.55);
}

.home-continue-sub {
  font-size: var(--app-font-size-body-sm);
  color: rgba(255, 255, 255, 0.78);
  line-height: var(--app-line-height-body);
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.45);
}

.home-continue-chevron {
  flex-shrink: 0;
  font-size: 22px;
  color: rgba(255, 255, 255, 0.88);
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
}

.home-actions {
  margin-top: var(--app-space-7);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.home-btn-primary {
  min-height: 52px;
}

.home-btn-outline {
  min-height: 52px;
}
</style>
