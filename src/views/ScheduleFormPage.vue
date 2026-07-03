<template>
  <ion-page class="tab-page">
    <ion-header class="auth-header ion-no-border">
      <ion-toolbar class="auth-toolbar tab-toolbar">
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon :icon="chevronBackOutline" class="auth-back-icon" />
          </ion-button>
        </ion-buttons>
        <ion-title class="auth-toolbar-title">{{ isEdit ? 'Edit schedule' : 'New schedule' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="auth-screen schedule-form-screen">
        <AppLoadingState
          v-if="isEdit && initialLoading"
          compact
          title="Loading schedule…"
        />

        <AppEmptyState
          v-else-if="!vibesLoading && !vibes.length"
          variant="card"
          :icon="musicalNotesOutline"
          title="No vibes to schedule"
          description="Create a vibe first, then come back to schedule when it should start."
          action-label="Create vibe"
          @action="router.replace('/vibes/create')"
        />

        <form v-else class="auth-form" @submit.prevent="handleSubmit">
          <div v-if="offline" class="schedule-form-offline" role="status">
            <ion-icon :icon="cloudOfflineOutline" />
            <span>{{ SCHEDULE_OFFLINE_MUTATION_MESSAGE }}</span>
          </div>

          <section
            v-if="isEdit && loadedSchedule"
            class="schedule-detail-summary"
            aria-label="Schedule details"
          >
            <div class="schedule-detail-summary__row">
              <span class="schedule-detail-summary__label">Vibe</span>
              <span class="schedule-detail-summary__value">{{ detailVibeName }}</span>
            </div>
            <div class="schedule-detail-summary__row">
              <span class="schedule-detail-summary__label">Automation</span>
              <AppAutomationBadge :badge="detailAutomationBadge" size="md" />
            </div>
          </section>

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.name"
              label="Name"
              label-placement="floating"
              placeholder="e.g. Morning focus"
              :disabled="submitting"
              required
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-select
              v-model="form.vibe_id"
              label="Vibe"
              label-placement="floating"
              placeholder="Choose a vibe"
              :disabled="submitting"
            >
              <ion-select-option v-for="vibe in vibes" :key="vibe.id" :value="vibe.id">
                {{ vibe.name }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-input
              v-model="form.timezone"
              label="Timezone (IANA)"
              label-placement="floating"
              placeholder="e.g. America/Sao_Paulo"
              :disabled="submitting"
              required
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-label position="stacked">Start date &amp; time</ion-label>
            <ion-datetime
              v-model="form.startWallTime"
              presentation="date-time"
              :prefer-wheel="false"
              :disabled="submitting"
              class="schedule-datetime"
            />
          </ion-item>

          <ion-item class="auth-item" lines="none">
            <ion-select
              v-model="form.recurrence_type"
              label="Repeats"
              label-placement="floating"
              :disabled="submitting"
            >
              <ion-select-option
                v-for="type in SELECTABLE_RECURRENCE_TYPES"
                :key="type"
                :value="type"
              >
                {{ recurrenceTypeLabel(type) }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <div v-if="form.recurrence_type === 'weekly'" class="schedule-weekdays">
            <p class="schedule-weekdays__label">Days of week</p>
            <div class="schedule-weekdays__row">
              <button
                v-for="opt in WEEKDAY_OPTIONS"
                :key="opt.iso"
                type="button"
                class="schedule-day-chip"
                :class="{ 'is-selected': form.daysOfWeek.includes(opt.iso) }"
                :disabled="submitting"
                :aria-pressed="form.daysOfWeek.includes(opt.iso)"
                @click="toggleDay(opt.iso)"
              >
                {{ opt.short }}
              </button>
            </div>
          </div>

          <ion-item class="auth-item schedule-toggle-item" lines="none">
            <ion-label>Enabled</ion-label>
            <ion-toggle v-model="form.is_enabled" slot="end" :disabled="submitting" />
          </ion-item>

          <p v-if="formError" class="auth-error">{{ formError }}</p>

          <ion-button
            type="submit"
            expand="block"
            class="auth-submit"
            :disabled="submitting || offline || !canSubmit"
          >
            <ion-spinner v-if="submitting" name="crescent" />
            <span v-else>{{ isEdit ? 'Save changes' : 'Create schedule' }}</span>
          </ion-button>
        </form>
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
  IonDatetime,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToggle,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  chevronBackOutline,
  cloudOfflineOutline,
  musicalNotesOutline,
} from 'ionicons/icons';
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppAutomationBadge from '@/components/ui/AppAutomationBadge.vue';
import AppEmptyState from '@/components/ui/AppEmptyState.vue';
import AppLoadingState from '@/components/ui/AppLoadingState.vue';
import { useSchedules } from '@/composables/useSchedules';
import { useVibes } from '@/composables/useVibes';
import {
  SCHEDULE_OFFLINE_MUTATION_MESSAGE,
  SELECTABLE_RECURRENCE_TYPES,
  isDeviceOffline,
  type RecurrenceType,
  type Schedule,
  type SchedulePayload,
} from '@/services/schedule.service';
import { scheduleAutomationBadge } from '@/utils/automation-badges';
import {
  hasDeviceActions,
  resolveScheduleVibeName,
} from '@/utils/automation-summary';
import {
  WEEKDAY_OPTIONS,
  isWeeklyConfigValid,
  recurrenceTypeLabel,
} from '@/utils/schedule-format';
import {
  deviceTimeZone,
  nowZonedWallTime,
  utcISOToZonedWallTime,
  zonedWallTimeToUtcISO,
} from '@/utils/schedule-datetime';

const route = useRoute();
const router = useRouter();
const { getSchedule, createSchedule, updateSchedule } = useSchedules();
const { vibes, fetchVibes, vibesListLoading: vibesLoading } = useVibes();

const scheduleId = computed(() => {
  const raw = route.params.id;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(id) && id > 0 ? id : null;
});
const isEdit = computed(() => scheduleId.value !== null);

const defaultTz = deviceTimeZone();

const form = reactive({
  name: '',
  vibe_id: null as number | null,
  timezone: defaultTz,
  startWallTime: nowZonedWallTime(defaultTz),
  recurrence_type: 'once' as RecurrenceType,
  daysOfWeek: [] as number[],
  is_enabled: true,
});

const initialLoading = ref(false);
const submitting = ref(false);
const formError = ref<string | null>(null);
const offline = ref(isDeviceOffline());
const showToast = ref(false);
const toastMessage = ref('');

/** The loaded schedule in edit mode — used for the read-only details summary. */
const loadedSchedule = ref<Schedule | null>(null);

const detailVibeName = computed(() => {
  const fallback = vibes.value.find((v) => v.id === loadedSchedule.value?.vibe_id)?.name;
  return resolveScheduleVibeName(loadedSchedule.value, fallback);
});

const detailAutomationBadge = computed(() =>
  scheduleAutomationBadge(hasDeviceActions(loadedSchedule.value), { includeEmpty: true })!,
);

function updateOnlineState(): void {
  offline.value = isDeviceOffline();
}

const canSubmit = computed(() => {
  if (!form.name.trim()) return false;
  if (form.vibe_id == null) return false;
  if (!form.timezone.trim()) return false;
  if (!form.startWallTime) return false;
  if (!isWeeklyConfigValid(form.recurrence_type, form.daysOfWeek)) return false;
  return true;
});

function toggleDay(iso: number): void {
  const index = form.daysOfWeek.indexOf(iso);
  if (index === -1) {
    form.daysOfWeek = [...form.daysOfWeek, iso].sort((a, b) => a - b);
  } else {
    form.daysOfWeek = form.daysOfWeek.filter((d) => d !== iso);
  }
}

function notify(message: string): void {
  toastMessage.value = message;
  showToast.value = true;
}

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});

onIonViewWillEnter(async () => {
  updateOnlineState();

  if (isEdit.value && offline.value) {
    notify(SCHEDULE_OFFLINE_MUTATION_MESSAGE);
    await router.replace('/schedules');
    return;
  }

  void fetchVibes();

  if (isEdit.value && scheduleId.value !== null) {
    initialLoading.value = true;
    const schedule = await getSchedule(scheduleId.value);
    initialLoading.value = false;

    if (!schedule) {
      router.back();
      return;
    }

    loadedSchedule.value = schedule;

    form.name = schedule.name;
    form.vibe_id = schedule.vibe_id;
    form.timezone = schedule.timezone || defaultTz;
    form.startWallTime = schedule.start_time
      ? utcISOToZonedWallTime(schedule.start_time, schedule.timezone || defaultTz)
      : nowZonedWallTime(schedule.timezone || defaultTz);
    form.recurrence_type =
      schedule.recurrence_type === 'monthly'
        ? 'once'
        : (schedule.recurrence_type as RecurrenceType);
    form.daysOfWeek = [...(schedule.recurrence_config?.days_of_week ?? [])].sort((a, b) => a - b);
    form.is_enabled = schedule.is_enabled;
  }
});

function buildPayload(): SchedulePayload | null {
  if (form.vibe_id == null) {
    formError.value = 'Choose a vibe to schedule.';
    return null;
  }

  if (form.recurrence_type === 'weekly' && !isWeeklyConfigValid('weekly', form.daysOfWeek)) {
    formError.value = 'Select at least one day of the week.';
    return null;
  }

  let startTimeUtc: string;
  try {
    startTimeUtc = zonedWallTimeToUtcISO(form.startWallTime, form.timezone.trim());
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Invalid start date and time.';
    return null;
  }

  return {
    vibe_id: form.vibe_id,
    name: form.name.trim(),
    timezone: form.timezone.trim(),
    start_time: startTimeUtc,
    recurrence_type: form.recurrence_type,
    recurrence_config:
      form.recurrence_type === 'weekly' ? { days_of_week: form.daysOfWeek } : null,
    is_enabled: form.is_enabled,
  };
}

async function handleSubmit(): Promise<void> {
  formError.value = null;
  updateOnlineState();

  if (offline.value) {
    notify(SCHEDULE_OFFLINE_MUTATION_MESSAGE);
    return;
  }

  const payload = buildPayload();
  if (!payload) return;

  submitting.value = true;
  try {
    const result =
      isEdit.value && scheduleId.value !== null
        ? await updateSchedule(scheduleId.value, payload)
        : await createSchedule(payload);

    if (result) {
      await router.replace('/schedules');
    } else {
      notify('Could not save schedule. Please try again.');
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.schedule-form-screen {
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
}

.schedule-form-offline {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
}

.schedule-form-offline ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--app-color-text-muted);
}

.schedule-detail-summary {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  margin-bottom: var(--app-space-5);
  padding: var(--app-space-4);
  border-radius: var(--app-radius-md);
  background: var(--app-color-surface-subtle);
  border: 1px solid var(--app-color-border);
}

.schedule-detail-summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  min-height: 28px;
}

.schedule-detail-summary__label {
  font-size: var(--app-font-size-body-sm);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.schedule-detail-summary__value {
  font-size: var(--app-font-size-body-md);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-color-text-primary);
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-datetime {
  width: 100%;
}

.schedule-weekdays {
  padding: var(--app-space-2) var(--app-space-4) var(--app-space-1);
}

.schedule-weekdays__label {
  margin: 0 0 var(--app-space-2);
  font-size: var(--app-font-size-caption);
  font-weight: var(--app-font-weight-semibold);
  color: var(--app-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.schedule-weekdays__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

.schedule-day-chip {
  min-width: 44px;
  min-height: 40px;
  padding: 0 var(--app-space-3);
  border-radius: var(--app-radius-md);
  border: 1px solid var(--app-color-border);
  background: var(--app-color-surface);
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-size-body-sm);
  font-weight: var(--app-font-weight-medium);
  cursor: pointer;
  transition:
    background var(--app-motion-fast) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard);
}

.schedule-day-chip.is-selected {
  background: var(--app-color-primary-100);
  border-color: var(--app-color-primary-500);
  color: var(--app-color-primary-600);
}

.schedule-day-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.schedule-toggle-item {
  margin-top: var(--app-space-2);
}
</style>
