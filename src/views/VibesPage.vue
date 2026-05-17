<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-title>My Vibes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="vibes-content page-shell">

        <AppLoadingState
          v-if="loading && !vibes.length"
          class="vibes-state-slot"
          compact
          title="Loading your vibes…"
        />

        <AppErrorState
          v-else-if="error && !vibes.length"
          class="vibes-state-slot"
          compact
          title="Couldn’t load vibes"
          :description="error ?? ''"
          retry-label="Retry"
          @retry="fetchVibes"
        />

        <AppEmptyState
          v-else-if="!vibes.length"
          class="vibes-state-slot"
          variant="card"
          :icon="musicalNotesOutline"
          title="No vibes yet"
          description="Create your first ambient mix — layers of sound you can play anytime."
          action-label="Create vibe"
          @action="goCreate"
        />

        <div v-else class="vibes-list">
          <div
            v-for="(vibe, i) in vibes"
            :key="vibe.id"
            class="vibe-card app-card-enter app-pressable"
            :class="{
              'vibe-card--has-image': !!getVibeCardImageUrl(vibe),
              'vibe-card--fallback': !getVibeCardImageUrl(vibe),
            }"
            :style="getVibeCardBackgroundStyle(vibe, i)"
            @click="router.push(`/vibes/${vibe.id}/player`)"
          >
            <div v-if="getVibeCardImageUrl(vibe)" class="vibe-card-scrim" aria-hidden="true" />
            <div v-else class="vibe-card-fallback-decor" aria-hidden="true">
              <span class="vibe-card-monogram">{{ vibeNameMonogram(vibe.name) }}</span>
              <ion-icon :icon="musicalNotesOutline" class="vibe-card-fallback-icon" />
            </div>
            <div class="vibe-card-overlay" />

            <div class="vibe-card-top-row">
              <div
                class="vibe-card-badge"
                :class="vibe.is_active ? 'badge-active' : 'badge-inactive'"
              >
                {{ vibe.is_active ? 'Active' : 'Inactive' }}
              </div>
              <div
                v-if="offlineVibeIds.includes(vibe.id)"
                class="vibe-card-badge vibe-card-badge--offline"
                aria-label="Available offline"
              >
                <ion-icon :icon="cloudOfflineOutline" />
                <span>Offline</span>
              </div>
            </div>

            <div class="vibe-card-bottom">
              <div class="vibe-card-text">
                <span class="vibe-card-name">{{ vibe.name }}</span>
                <span v-if="vibe.description" class="vibe-card-desc">
                  {{ vibe.description }}
                </span>
              </div>
              <div class="vibe-card-actions">
                <button class="vibe-action-btn" @click.stop="router.push(`/vibes/${vibe.id}/sounds`)" aria-label="Manage sounds">
                  <ion-icon :icon="musicalNotesOutline" />
                </button>
                <button class="vibe-action-btn" @click.stop="goEdit(vibe.id)" aria-label="Edit vibe">
                  <ion-icon :icon="pencilOutline" />
                </button>
                <button class="vibe-action-btn danger" @click.stop="handleDelete(vibe.id)" aria-label="Delete vibe">
                  <ion-icon :icon="trashOutline" />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="vibes-fab">
        <ion-fab-button router-link="/vibes/create" color="primary">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from '@ionic/vue';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { addOutline, cloudOfflineOutline, musicalNotesOutline, pencilOutline, trashOutline } from 'ionicons/icons';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useVibes } from '@/composables/useVibes';
import { getDownloadedVibeIds } from '@/services/offline-downloads.service';
import { getVibeCardBackgroundStyle, getVibeCardImageUrl } from '@/utils/artwork';

const router = useRouter();
const { vibes, loading, error, fetchVibes, deleteVibe } = useVibes();

const offlineVibeIds = ref<number[]>([]);

async function refreshOfflineBadges(): Promise<void> {
  offlineVibeIds.value = await getDownloadedVibeIds();
}

onMounted(() => {
  void fetchVibes();
  void refreshOfflineBadges();
});

onIonViewWillEnter(() => {
  void refreshOfflineBadges();
});

function vibeNameMonogram(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t.charAt(0).toUpperCase();
}

function goCreate(): void {
  router.push('/vibes/create');
}

function goEdit(id: number) {
  router.push(`/vibes/${id}/edit`);
}

async function handleDelete(id: number) {
  const alert = await alertController.create({
    header: 'Delete Vibe',
    message: 'Are you sure you want to delete this vibe?',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive', handler: () => deleteVibe(id) },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
/* ── Page content ─────────────────────────────── */

.vibes-content {
  /* Extra bottom padding clears the FAB (72px) above the tab bar + safe area */
  padding-top: var(--app-space-2);
  padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
}

.vibes-state-slot {
  margin-top: var(--app-space-6);
}

/* ── Card list ────────────────────────────────── */

.vibes-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Vibe card ────────────────────────────────── */

.vibe-card {
  position: relative;
  width: 100%;
  height: 192px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
}

.vibe-card-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.05) 42%,
    rgba(0, 0, 0, 0.02) 58%,
    rgba(0, 0, 0, 0.68) 100%
  );
}

.vibe-card-fallback-decor {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.vibe-card-monogram {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.15);
}

.vibe-card-fallback-icon {
  position: absolute;
  bottom: 96px;
  right: 14px;
  font-size: 26px;
  color: rgba(255, 255, 255, 0.14);
}

/* Bottom dark blur strip */
.vibe-card-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  z-index: 1;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 0 0 12px 12px;
}

.vibe-card--has-image .vibe-card-overlay {
  background: rgba(15, 23, 42, 0.42);
}

/* Top badges — Active (left) · Offline (right) */
.vibe-card-top-row {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  z-index: 2;
}

.vibe-card-badge {
  height: 24px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  border-radius: 20px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.vibe-card-badge--offline {
  gap: 4px;
  padding: 0 8px 0 6px;
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.38);
  color: rgba(255, 255, 255, 0.94);
}

.vibe-card-badge--offline ion-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.badge-active {
  background: rgba(16, 185, 129, 0.22);
  border: 1px solid rgba(52, 211, 153, 0.45);
  color: #6ee7b7;
}

.badge-inactive {
  background: rgba(100, 116, 139, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: rgba(255, 255, 255, 0.6);
}

/* Bottom content row */
.vibe-card-bottom {
  position: absolute;
  left: 16px;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  z-index: 2;
}

.vibe-card-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.vibe-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.2px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);
}

.vibe-card-desc {
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.78);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Action buttons — 44 × 44 px touch target */
.vibe-card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.vibe-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition:
    background var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-standard);
  padding: 0;
}

.vibe-action-btn:active {
  background: rgba(255, 255, 255, 0.28);
  transform: scale(0.94);
}

.vibe-action-btn.danger {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.4);
}

.vibe-action-btn.danger:active {
  background: rgba(239, 68, 68, 0.42);
}

/* FAB keeps a 16px gap above the mini player (or above the tab bar when hidden). */
.vibes-fab {
  --bottom: calc(var(--app-mini-player-height, 0px) + 16px);
}
</style>
