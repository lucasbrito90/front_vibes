import { computed, ref } from 'vue';
import {
  isDeviceOffline,
  scheduleService,
  type Schedule,
  type SchedulePayload,
} from '@/services/schedule.service';
import { scheduleMirrorService } from '@/services/schedule-mirror.service';

/**
 * Module-level reactive state for the Scheduler MVP, mirroring the `useVibes` pattern
 * (shared singleton refs, no Pinia). Online CRUD writes to the API and updates the
 * SQLite mirror; offline reads are served from the mirror only (read-only).
 */
const schedules = ref<Schedule[]>([]);
const selectedSchedule = ref<Schedule | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** Separate list-fetch state so the list page doesn't react to mutation/detail errors. */
const listLoading = ref(false);
const listError = ref<string | null>(null);

/** True when the current list was loaded from the offline mirror. */
const fromMirror = ref(false);

/** ISO timestamp of the last successful mirror sync, if any. */
const lastSyncedAt = ref<string | null>(null);

let listFetchGen = 0;

const isOffline = computed(() => isDeviceOffline());

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function clearError(): void {
  error.value = null;
}

async function refreshLastSyncedAt(): Promise<void> {
  lastSyncedAt.value = await scheduleMirrorService.getLastSyncedAt();
}

async function fetchSchedules(): Promise<void> {
  const gen = ++listFetchGen;
  listLoading.value = true;
  listError.value = null;

  try {
    if (isDeviceOffline()) {
      await scheduleMirrorService.initialize();
      const cached = await scheduleMirrorService.listFromMirror();
      if (gen !== listFetchGen) return;
      schedules.value = cached;
      fromMirror.value = true;
      await refreshLastSyncedAt();
      listError.value = null;
      return;
    }

    const data = await scheduleService.getSchedules();
    if (gen !== listFetchGen) return;
    schedules.value = data;
    fromMirror.value = false;

    try {
      await scheduleMirrorService.replaceFromApi(data);
      await refreshLastSyncedAt();
    } catch (mirrorErr) {
      if (import.meta.env.DEV) {
        console.warn('[useSchedules] API fetch succeeded but mirror write failed:', mirrorErr);
      }
    }

    listError.value = null;
  } catch (err) {
    if (gen !== listFetchGen) return;

    try {
      await scheduleMirrorService.initialize();
      const cached = await scheduleMirrorService.listFromMirror();
      if (cached.length > 0) {
        schedules.value = cached;
        fromMirror.value = true;
        await refreshLastSyncedAt();
        listError.value = err instanceof Error ? err.message : 'Something went wrong.';
        return;
      }
    } catch {
      /* mirror read failed — surface original error */
    }

    listError.value = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    if (gen === listFetchGen) {
      listLoading.value = false;
    }
  }
}

async function syncSchedules(): Promise<Schedule[]> {
  const data = await scheduleMirrorService.pullSchedules();
  schedules.value = data;
  fromMirror.value = false;
  await refreshLastSyncedAt();
  return data;
}

async function getSchedule(id: number): Promise<Schedule | null> {
  loading.value = true;
  error.value = null;
  try {
    if (isDeviceOffline()) {
      await scheduleMirrorService.initialize();
      const cached =
        schedules.value.find((s) => s.id === id) ??
        (await scheduleMirrorService.getFromMirror(id));
      selectedSchedule.value = cached;
      return cached;
    }

    const existing = schedules.value.find((s) => s.id === id);
    const schedule = existing ?? (await scheduleService.getSchedule(id));
    selectedSchedule.value = schedule;

    try {
      await scheduleMirrorService.upsertFromApi(schedule);
    } catch (mirrorErr) {
      if (import.meta.env.DEV) {
        console.warn('[useSchedules] Schedule fetch succeeded but mirror upsert failed:', mirrorErr);
      }
    }

    return schedule;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function createSchedule(payload: SchedulePayload): Promise<Schedule | null> {
  loading.value = true;
  error.value = null;
  try {
    const schedule = await scheduleService.createSchedule(payload);
    schedules.value.unshift(schedule);
    try {
      await scheduleMirrorService.upsertFromApi(schedule);
      await refreshLastSyncedAt();
    } catch (mirrorErr) {
      if (import.meta.env.DEV) {
        console.warn('[useSchedules] Create succeeded but mirror upsert failed:', mirrorErr);
      }
    }
    return schedule;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateSchedule(
  id: number,
  payload: Partial<SchedulePayload>,
): Promise<Schedule | null> {
  loading.value = true;
  error.value = null;
  try {
    const updated = await scheduleService.updateSchedule(id, payload);
    const index = schedules.value.findIndex((s) => s.id === id);
    if (index !== -1) schedules.value[index] = updated;
    selectedSchedule.value = updated;

    try {
      await scheduleMirrorService.upsertFromApi(updated);
      await refreshLastSyncedAt();
    } catch (mirrorErr) {
      if (import.meta.env.DEV) {
        console.warn('[useSchedules] Update succeeded but mirror upsert failed:', mirrorErr);
      }
    }

    return updated;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteSchedule(id: number): Promise<boolean> {
  loading.value = true;
  error.value = null;
  try {
    await scheduleService.deleteSchedule(id);
    schedules.value = schedules.value.filter((s) => s.id !== id);

    try {
      await scheduleMirrorService.deleteFromMirror(id);
    } catch (mirrorErr) {
      if (import.meta.env.DEV) {
        console.warn('[useSchedules] Delete succeeded but mirror delete failed:', mirrorErr);
      }
    }

    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    loading.value = false;
  }
}

export function useSchedules() {
  return {
    schedules,
    selectedSchedule,
    loading,
    error,
    listLoading,
    listError,
    fromMirror,
    lastSyncedAt,
    isOffline,
    fetchSchedules,
    syncSchedules,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    clearError,
  };
}
