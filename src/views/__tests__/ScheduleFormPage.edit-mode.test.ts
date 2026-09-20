import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';

/**
 * Edit-mode load ordering for the ADR-036 Decision 5 warning.
 *
 * `ScheduleFormPage` enters edit mode by firing `fetchVibes()` WITHOUT
 * awaiting it and then awaiting `getSchedule()`, whose result assigns
 * `form.vibe_id`. Those two requests race. The warning derivation resolves
 * the selected vibe (and its `scene_id`) out of the `vibes` list, so when the
 * schedule wins the race the list is still empty, no vibe is found, and the
 * evaluation concludes there is nothing to warn about — permanently, unless
 * something re-evaluates once the list lands.
 *
 * These tests drive that exact ordering, with the REAL
 * useScheduleExecutionWarning composable running against mocked services (the
 * sibling ScheduleFormPage.test.ts mocks the composable's state instead, which
 * is why the interaction between the two was not covered there).
 */

const {
  mockGetSchedule,
  mockGetVibes,
  mockListSceneDeviceActions,
  mockGetProviderTypes,
  mockIsDeviceOffline,
} = vi.hoisted(() => ({
  mockGetSchedule: vi.fn(),
  mockGetVibes: vi.fn(),
  mockListSceneDeviceActions: vi.fn(),
  mockGetProviderTypes: vi.fn(),
  mockIsDeviceOffline: vi.fn((): boolean => false),
}));

vi.mock('@/services/schedule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/schedule.service')>();
  return {
    ...actual,
    isDeviceOffline: mockIsDeviceOffline,
    scheduleService: { ...actual.scheduleService, getSchedule: mockGetSchedule },
  };
});

vi.mock('@/services/vibe.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/vibe.service')>();
  return {
    ...actual,
    vibeService: { ...actual.vibeService, getVibes: mockGetVibes },
  };
});

vi.mock('@/services/scene-device-action.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/scene-device-action.service')>();
  return {
    ...actual,
    sceneDeviceActionService: {
      ...actual.sceneDeviceActionService,
      listSceneDeviceActions: mockListSceneDeviceActions,
    },
  };
});

vi.mock('@/services/provider-connection.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/provider-connection.service')>();
  return {
    ...actual,
    providerConnectionService: {
      ...actual.providerConnectionService,
      getProviderTypes: mockGetProviderTypes,
    },
  };
});

/**
 * `onIonViewWillEnter` only fires inside a real `ion-router-outlet`, which a
 * bare `mount()` does not provide — without this the page would never load
 * the schedule at all and the race under test could not happen. Aliasing it to
 * `onMounted` keeps the page's real entry sequence intact.
 */
vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>();
  const { onMounted } = await import('vue');
  return {
    ...actual,
    onIonViewWillEnter: (cb: () => void) => onMounted(cb),
  };
});

import { useProviderTypes } from '@/composables/useProviderTypes';
import { useScheduleExecutionWarning } from '@/composables/useScheduleExecutionWarning';
import { useSchedules } from '@/composables/useSchedules';
import { useVibes } from '@/composables/useVibes';
import { SCHEDULE_EXECUTION_WARNING_MESSAGE } from '@/utils/automation-summary';
import ScheduleFormPage from '@/views/ScheduleFormPage.vue';

const SCHEDULED_VIBE_ID = 7;
const SCENE_ID = 10;

/** Declares scheduled_execution — actions on it never warn. */
const homeAssistantProviderType = {
  slug: 'home_assistant',
  label: 'Home Assistant',
  config: {},
  credentials: {},
  execution_capabilities: [
    'device_discovery',
    'state_read',
    'interactive_execution',
    'server_side_execution',
    'scheduled_execution',
  ],
};

/** No scheduled_execution — this is what must produce the warning. */
const googleHomeProviderType = {
  slug: 'google_home',
  label: 'Google Home',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

function scheduledVibe() {
  return {
    id: SCHEDULED_VIBE_ID,
    name: 'Bedtime',
    description: null,
    thumbnail_url: null,
    card_image_url: null,
    player_background_url: null,
    artwork_url: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    scene_id: SCENE_ID,
  };
}

function editedSchedule() {
  return {
    id: 3,
    vibe_id: SCHEDULED_VIBE_ID,
    name: 'Bedtime routine',
    timezone: 'UTC',
    start_time: '2026-09-20T22:00:00.000Z',
    recurrence_type: 'daily',
    recurrence_config: null,
    is_enabled: true,
    next_run_at: null,
    last_run_at: null,
    created_at: null,
    updated_at: null,
    vibe_name: 'Bedtime',
    device_actions_count: 1,
    has_device_actions: true,
  };
}

function actionOn(provider: string) {
  return {
    id: 1,
    scene_id: SCENE_ID,
    device_id: 1,
    action_type: 'turn_on',
    parameters: null,
    sort_order: 0,
    delay_seconds: 0,
    created_at: null,
    updated_at: null,
    device: {
      id: 1,
      name: 'QuartoCasalUm',
      type: 'lighting',
      provider,
      status: 'online',
      provider_device_id: 'gh-opaque-id',
      capabilities: null,
    },
  };
}

/** A promise whose resolution this test controls, to force the load ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function mountEditPage() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/schedules' },
      { path: '/schedules', component: defineComponent({ template: '<div/>' }) },
      { path: '/schedules/new', component: ScheduleFormPage },
      { path: '/schedules/:id/edit', component: ScheduleFormPage },
      { path: '/vibes/create', component: defineComponent({ template: '<div/>' }) },
    ],
  });

  await router.push('/schedules/3/edit');
  await router.isReady();

  return mount(ScheduleFormPage, { global: { plugins: [router] } });
}

beforeEach(() => {
  const { vibes } = useVibes();
  const { providerTypes } = useProviderTypes();
  const { hasUnschedulableActions } = useScheduleExecutionWarning();
  const { schedules } = useSchedules();

  vibes.value = [];
  providerTypes.value = [homeAssistantProviderType, googleHomeProviderType];
  hasUnschedulableActions.value = false;
  schedules.value = [];

  mockIsDeviceOffline.mockReset().mockReturnValue(false);
  mockGetSchedule.mockReset().mockResolvedValue(editedSchedule());
  mockGetVibes.mockReset().mockResolvedValue([scheduledVibe()]);
  mockListSceneDeviceActions.mockReset().mockResolvedValue([actionOn('google_home')]);
  mockGetProviderTypes
    .mockReset()
    .mockResolvedValue([homeAssistantProviderType, googleHomeProviderType]);
});

afterEach(() => {
  const { hasUnschedulableActions } = useScheduleExecutionWarning();
  hasUnschedulableActions.value = false;
  vi.clearAllMocks();
});

describe('ScheduleFormPage (edit mode) — warning survives the vibes/schedule load race', () => {
  it('still warns when the vibes list resolves AFTER the schedule has set the vibe', async () => {
    const vibesLoad = deferred<ReturnType<typeof scheduledVibe>[]>();
    mockGetVibes.mockReturnValue(vibesLoad.promise);

    const wrapper = await mountEditPage();

    // The schedule wins the race: vibe_id is set while `vibes` is still empty,
    // so the first evaluation cannot resolve the vibe or its scene.
    await vi.waitUntil(() => wrapper.text().includes('Bedtime'));
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(SCHEDULE_EXECUTION_WARNING_MESSAGE);

    // The vibes list lands late — the warning must still be derived.
    vibesLoad.resolve([scheduledVibe()]);
    await vi.waitUntil(() => wrapper.text().includes(SCHEDULE_EXECUTION_WARNING_MESSAGE));

    expect(mockListSceneDeviceActions).toHaveBeenCalledWith(SCENE_ID);
  });

  it('warns when the vibes list resolves BEFORE the schedule — the other order', async () => {
    const scheduleLoad = deferred<ReturnType<typeof editedSchedule>>();
    mockGetSchedule.mockReturnValue(scheduleLoad.promise);

    const wrapper = await mountEditPage();
    await vi.waitUntil(() => useVibes().vibes.value.length > 0);

    scheduleLoad.resolve(editedSchedule());
    await vi.waitUntil(() => wrapper.text().includes(SCHEDULE_EXECUTION_WARNING_MESSAGE));

    expect(mockListSceneDeviceActions).toHaveBeenCalledWith(SCENE_ID);
  });

  it('does not warn on a late vibes list when every action is schedulable', async () => {
    mockListSceneDeviceActions.mockResolvedValue([actionOn('home_assistant')]);
    const vibesLoad = deferred<ReturnType<typeof scheduledVibe>[]>();
    mockGetVibes.mockReturnValue(vibesLoad.promise);

    const wrapper = await mountEditPage();
    await vi.waitUntil(() => wrapper.text().includes('Bedtime'));

    vibesLoad.resolve([scheduledVibe()]);
    await vi.waitUntil(() => mockListSceneDeviceActions.mock.calls.length > 0);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain(SCHEDULE_EXECUTION_WARNING_MESSAGE);
  });
});
