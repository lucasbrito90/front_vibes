<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="vibes-toolbar">
        <ion-title class="vibes-toolbar-title">My Vibes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="vibes-content">

        <div v-if="loading && !vibes.length" class="vibes-state">
          <ion-spinner name="crescent" color="primary" />
        </div>

        <div v-else-if="error && !vibes.length" class="vibes-state">
          <p class="vibes-state-msg error">{{ error }}</p>
          <ion-button fill="outline" size="small" @click="fetchVibes">Retry</ion-button>
        </div>

        <div v-else-if="!vibes.length" class="vibes-state">
          <p class="vibes-state-title">No vibes yet</p>
          <p class="vibes-state-sub">Create your first vibe</p>
          <ion-button router-link="/vibes/create" expand="block" class="vibes-create-btn">
            Create Vibe
          </ion-button>
        </div>

        <div v-else class="vibes-list">
          <div
            v-for="(vibe, i) in vibes"
            :key="vibe.id"
            class="vibe-card"
            :style="{ background: gradients[i % gradients.length] }"
            @click="router.push(`/vibes/${vibe.id}/player`)"
          >
            <div class="vibe-card-overlay" />

            <div
              class="vibe-card-badge"
              :class="vibe.is_active ? 'badge-active' : 'badge-inactive'"
            >
              {{ vibe.is_active ? 'Active' : 'Inactive' }}
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
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
} from '@ionic/vue';
import { addOutline, musicalNotesOutline, pencilOutline, trashOutline } from 'ionicons/icons';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useVibes } from '@/composables/useVibes';

const router = useRouter();
const { vibes, loading, error, fetchVibes, deleteVibe } = useVibes();

const gradients = [
  'linear-gradient(160deg, #3a1c71 0%, #4a1890 55%, #1a1a6e 100%)',
  'linear-gradient(160deg, #b0298a 0%, #8b2fc9 100%)',
  'linear-gradient(160deg, #1dac92 0%, #0e7490 55%, #0f3f5c 100%)',
  'linear-gradient(160deg, #d97706 0%, #b45309 55%, #7c2d12 100%)',
  'linear-gradient(160deg, #4338ca 0%, #6d28d9 100%)',
];

onMounted(fetchVibes);

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
.vibes-toolbar {
  --background: var(--app-color-bg);
  --border-style: none;
  padding-top: 4px;
}

.vibes-toolbar-title {
  font-size: var(--app-font-size-h6);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
}

/* ── Page content ─────────────────────────────── */

.vibes-content {
  /* Extra bottom padding clears the FAB (72px) above the tab bar */
  padding: 8px 20px 100px;
}

/* ── Empty / loading states ───────────────────── */

.vibes-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
}

.vibes-state-title {
  font-size: var(--app-font-size-h6);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-primary);
  margin: 0;
}

.vibes-state-sub {
  font-size: var(--app-font-size-body-md);
  color: var(--app-color-text-secondary);
  margin: 0;
}

.vibes-state-msg {
  font-size: var(--app-font-size-body-md);
  margin: 0;
}

.vibes-state-msg.error {
  color: var(--ion-color-danger);
}

.vibes-create-btn {
  margin-top: 8px;
  width: 200px;
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
}

/* Bottom dark blur strip */
.vibe-card-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 68px;
  background: rgba(15, 23, 42, 0.25);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 0 0 12px 12px;
}

/* Badge — top left */
.vibe-card-badge {
  position: absolute;
  top: 14px;
  left: 14px;
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
  z-index: 1;
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
  z-index: 1;
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
}

.vibe-card-desc {
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.75);
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
  transition: background 0.15s;
  padding: 0;
}

.vibe-action-btn:active {
  background: rgba(255, 255, 255, 0.28);
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
