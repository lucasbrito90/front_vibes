<template>
  <ion-page class="tab-page">
    <ion-header class="ion-no-border">
      <ion-toolbar class="tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Schedules</ion-title>
        <ion-buttons slot="end">
          <ion-button
            fill="clear"
            aria-label="New schedule"
            :disabled="offline"
            @click="goCreate"
          >
            <ion-icon :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="schedules-content page-shell">
        <div v-if="offline" class="schedules-offline-banner" role="status">
          <ion-icon :icon="cloudOfflineOutline" />
          <span>{{ SCHEDULE_OFFLINE_VIEW_MESSAGE }}</span>
        </div>

        <div v-if="notificationsDenied && !offline" class="schedules-offline-banner" role="status">
          <ion-icon :icon="notificationsOffOutline" />
          <span>{{ NOTIFICATION_PERMISSION_DENIED_MESSAGE }}</span>
        </div>

        <AppLoadingState
          v-if="listLoading && !schedules.length"
          class="schedules-state-slot"
          compact
          title="Loading your schedules…"
          description="Fetching your reminders and Smart Home automations."
        />

        <AppErrorState
          v-else-if="listError && !schedules.length"
          class="schedules-state-slot"
          compact
          title="Couldn’t load schedules"
          :description="listError ?? ''"
          retry-label="Retry"
          @retry="fetchSchedules"
        />

        <AppEmptyState
          v-else-if="!schedules.length"
          class="schedules-state-slot"
          variant="card"
          :icon="alarmOutline"
          :title="offline ? 'No cached schedules' : 'No schedules yet'"
          :description="
            offline
              ? SCHEDULE_OFFLINE_EMPTY_MESSAGE
              : 'Schedule a vibe to start on time — any Smart Home actions it includes run too.'
          "
          :action-label="offline ? undefined : 'New schedule'"
          @action="goCreate"
        />

        <div v-else class="schedules-list">
          <article
            v-for="schedule in schedules"
            :key="schedule.id"
            class="app-surface-card schedule-card app-card-enter"
          >
            <div class="schedule-card-head">
              <div class="schedule-card-title-wrap">
                <h2 class="schedule-card-name">{{ schedule.name }}</h2>
                <span class="schedule-card-vibe">{{ scheduleVibeName(schedule) }}</span>
              </div>
              <span
                class="schedule-card-status"
                :class="schedule.is_enabled ? 'is-enabled' : 'is-disabled'"
              >
                {{ schedule.is_enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>

            <div
              v-if="automationBadgeFor(schedule)"
              class="schedule-card-tags"
            >
              <AppAutomationBadge :badge="automationBadgeFor(schedule)!" />
            </div>

            <dl class="schedule-card-meta">
              <div class="schedule-card-meta-row">
                <ion-icon :icon="repeatOutline" aria-hidden="true" />
                <dd>{{ recurrenceSummary(schedule) }}</dd>
              </div>
              <div class="schedule-card-meta-row">
                <ion-icon :icon="timeOutline" aria-hidden="true" />
                <dd>Next: {{ formatNextRun(schedule) }}</dd>
              </div>
              <div class="schedule-card-meta-row">
                <ion-icon :icon="globeOutline" aria-hidden="true" />
                <dd>{{ schedule.timezone }}</dd>
              </div>
            </dl>

            <div class="schedule-card-actions">
              <ion-button
                fill="outline"
                size="small"
                :disabled="offline"
                @click="goEdit(schedule.id)"
              >
                <ion-icon slot="start" :icon="pencilOutline" />
                Edit
              </ion-button>
              <ion-button
                fill="outline"
                size="small"
                color="danger"
                :disabled="offline"
                @click="confirmDelete(schedule)"
              >
                <ion-icon slot="start" :icon="trashOutline" />
                Delete
              </ion-button>
            </div>
          </article>
        </div>
      </div>

      <ion-toast
        :is-open="showToast"
        :message="toastMessage"
        :duration="3000"
        position="bottom"
        @didDismiss="showToast = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToast,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from '@ionic/vue';
import type { RefresherCustomEvent } from '@ionic/vue';
import {
  addOutline,
  alarmOutline,
  chevronBackOutline,
  cloudOfflineOutline,
  globeOutline,
  notificationsOffOutline,
  pencilOutline,
  repeatOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppAutomationBadge from '@/components/ui/AppAutomationBadge.vue';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppErrorState from '@/components/ui/AppErrorState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useSchedules } from '@/composables/useSchedules';
import { useVibes } from '@/composables/useVibes';
import {
  SCHEDULE_OFFLINE_MUTATION_MESSAGE,
  isDeviceOffline,
  type Schedule,
} from '@/services/schedule.service';
import {
  SCHEDULE_OFFLINE_EMPTY_MESSAGE,
  SCHEDULE_OFFLINE_VIEW_MESSAGE,
} from '@/services/schedule-mirror.service';
import {
  NOTIFICATION_PERMISSION_DENIED_MESSAGE,
  scheduleNotificationService,
} from '@/services/schedule-notification.service';
import {
  scheduleAutomationBadge,
  type AutomationBadge,
} from '@/utils/automation-badges';
import {
  hasDeviceActions,
  resolveScheduleVibeName,
} from '@/utils/automation-summary';
import { formatNextRun, recurrenceSummary } from '@/utils/schedule-format';

const router = useRouter();
const { schedules, listLoading, listError, fetchSchedules, deleteSchedule } = useSchedules();
const { vibes, fetchVibes } = useVibes();

const offline = ref(isDeviceOffline());
const notificationsDenied = ref(false);
const showToast = ref(false);
const toastMessage = ref('');

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

onMounted(() => {
  window.addEventListener('online', onNetworkChange);
  window.addEventListener('offline', onNetworkChange);
});

onUnmounted(() => {
  window.removeEventListener('online', onNetworkChange);
  window.removeEventListener('offline', onNetworkChange);
});

function onNetworkChange(): void {
  updateOnlineState();
  if (!offline.value) {
    void fetchSchedules();
    void fetchVibes();
  } else {
    void fetchSchedules();
  }
}

onIonViewWillEnter(() => {
  updateOnlineState();
  void fetchSchedules();
  if (!offline.value) {
    void fetchVibes();
    void checkAndRequestNotificationPermission();
  }
});

async function checkAndRequestNotificationPermission(): Promise<void> {
  const current = await scheduleNotificationService.checkPermission();
  if (current === 'granted') {
    notificationsDenied.value = false;
    return;
  }
  if (current === 'prompt') {
    const granted = await scheduleNotificationService.requestPermission();
    notificationsDenied.value = !granted;
    return;
  }
  // 'denied' — permission was already explicitly denied by the user
  notificationsDenied.value = true;
}

function vibeNameFor(vibeId: number): string {
  const vibe = vibes.value.find((v) => v.id === vibeId);
  return vibe?.name ?? `Vibe #${vibeId}`;
}

/** Prefer the API-provided vibe name; fall back to the locally loaded vibe list. */
function scheduleVibeName(schedule: Schedule): string {
  return resolveScheduleVibeName(schedule, vibeNameFor(schedule.vibe_id));
}

/** Automation badge metadata, or null when the vibe has no device actions. */
function automationBadgeFor(schedule: Schedule): AutomationBadge | null {
  return scheduleAutomationBadge(hasDeviceActions(schedule));
}

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

function goCreate(): void {
  if (blockedOffline()) return;
  router.push('/schedules/new');
}

function goEdit(id: number): void {
  if (blockedOffline()) return;
  router.push(`/schedules/${id}/edit`);
}

function blockedOffline(): boolean {
  updateOnlineState();
  if (offline.value) {
    notify(SCHEDULE_OFFLINE_MUTATION_MESSAGE);
    return true;
  }
  return false;
}

async function onRefresh(event: RefresherCustomEvent): Promise<void> {
  updateOnlineState();
  if (!offline.value) {
    await fetchSchedules();
    await fetchVibes();
  } else {
    await fetchSchedules();
  }
  await event.target.complete();
}

async function confirmDelete(schedule: Schedule): Promise<void> {
  if (blockedOffline()) return;

  const alert = await alertController.create({
    header: 'Delete schedule',
    message: `Delete “${schedule.name}”? This cannot be undone.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void runDelete(schedule.id);
        },
      },
    ],
  });
  await alert.present();
}

async function runDelete(id: number): Promise<void> {
  if (blockedOffline()) return;
  const ok = await deleteSchedule(id);
  notify(ok ? 'Schedule deleted.' : 'Could not delete schedule.');
}
</script>

<style scoped>
.schedules-content {
  padding-top: var(--app-space-2);
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
}

.schedules-state-slot {
  margin-top: var(--app-space-6);
}

.schedules-offline-banner {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-4);
  padding: var(--app-space-3) var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.schedules-offline-banner ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.schedules-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.schedule-card {
  padding: var(--app-space-5);
}

.schedule-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.schedule-card-title-wrap {
  min-width: 0;
}

.schedule-card-name {
  margin: 0;
  font-size: var(--app-font-size-body-lg);
  font-weight: var(--app-font-weight-bold);
  color: var(--app-color-text-primary);
  line-height: var(--app-line-height-heading-tight);
}

.schedule-card-vibe {
  display: block;
  margin-top: 2px;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
}

.schedule-card-status {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: var(--app-font-weight-semibold);
  letter-spacing: 0.02em;
}

.schedule-card-status.is-enabled {
  background: var(--app-color-primary-100);
  color: var(--app-color-primary-600);
}

.schedule-card-status.is-disabled {
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-muted);
}

.schedule-card-tags {
  margin-top: var(--app-space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

.schedule-card-meta {
  margin: var(--app-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.schedule-card-meta-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}

.schedule-card-meta-row ion-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--app-color-text-muted);
}

.schedule-card-meta dd {
  margin: 0;
  font-size: var(--app-font-size-body-sm);
  color: var(--app-color-text-secondary);
}

.schedule-card-actions {
  margin-top: var(--app-space-4);
  display: flex;
  gap: var(--app-space-2);
}
</style>
