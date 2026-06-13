import { ref } from 'vue';
import {
  scheduleService,
  type Schedule,
  type SchedulePayload,
} from '@/services/schedule.service';

/**
 * Module-level reactive state for the Scheduler MVP, mirroring the `useVibes` pattern
 * (shared singleton refs, no Pinia). Online-only: mutations surface API/offline errors
 * through `error`; offline viewing is limited to whatever is already in memory.
 */
const schedules = ref<Schedule[]>([]);
const selectedSchedule = ref<Schedule | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** Separate list-fetch state so the list page doesn't react to mutation/detail errors. */
const listLoading = ref(false);
const listError = ref<string | null>(null);

let listFetchGen = 0;

function handleError(err: unknown): void {
  error.value = err instanceof Error ? err.message : 'Something went wrong.';
}

function clearError(): void {
  error.value = null;
}

async function fetchSchedules(): Promise<void> {
  const gen = ++listFetchGen;
  listLoading.value = true;
  listError.value = null;
  try {
    const data = await scheduleService.getSchedules();
    if (gen !== listFetchGen) return;
    schedules.value = data;
    listError.value = null;
  } catch (err) {
    if (gen !== listFetchGen) return;
    listError.value = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    if (gen === listFetchGen) {
      listLoading.value = false;
    }
  }
}

async function getSchedule(id: number): Promise<Schedule | null> {
  loading.value = true;
  error.value = null;
  try {
    const existing = schedules.value.find((s) => s.id === id);
    const schedule = existing ?? (await scheduleService.getSchedule(id));
    selectedSchedule.value = schedule;
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
    fetchSchedules,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    clearError,
  };
}
