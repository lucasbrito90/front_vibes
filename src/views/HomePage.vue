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
          v-if="loading && !vibes.length && !error"
          compact
          title="Loading…"
          description="Fetching your vibes"
        />

        <AppErrorState
          v-else-if="error && !vibes.length"
          compact
          title="Couldn’t load your vibes"
          :description="error"
          retry-label="Try again"
          @retry="fetchVibes"
        />

        <template v-else>
          <p class="home-greeting">{{ greeting }}</p>
          <p v-if="displayName" class="home-name">{{ displayName }}</p>
          <p v-if="emailHint" class="home-email">{{ emailHint }}</p>

          <AppEmptyState
            v-if="!vibes.length"
            variant="card"
            class="home-onboarding"
            :icon="sparklesOutline"
            title="Create your first vibe"
            description="Layer ambient sounds into a mix you can play anywhere — online or offline after download."
            action-label="New vibe"
            @action="goCreateVibe"
          />

          <template v-else>
            <router-link class="home-continue-card app-surface-card" to="/vibes">
              <div class="home-continue-copy">
                <span class="home-continue-label">Continue your vibe</span>
                <span class="home-continue-sub">Open My Vibes and pick up where you left off</span>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="home-continue-chevron" />
            </router-link>
          </template>

          <div class="home-actions">
            <ion-button expand="block" class="home-btn-primary" router-link="/vibes">
              My Vibes
            </ion-button>
            <ion-button expand="block" fill="outline" class="home-btn-outline" router-link="/settings">
              Settings
            </ion-button>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { chevronForwardOutline, sparklesOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useVibes } from '@/composables/useVibes';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';

const router = useRouter();
const { currentUser } = useAuth();
const { vibes, loading, error, fetchVibes } = useVibes();

onMounted(() => {
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  padding: var(--app-space-5) var(--app-space-5);
  text-decoration: none;
  color: inherit;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
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
  color: var(--app-color-text-primary);
}

.home-continue-sub {
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
  line-height: var(--app-line-height-body);
}

.home-continue-chevron {
  flex-shrink: 0;
  font-size: 22px;
  color: var(--app-color-text-muted);
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
