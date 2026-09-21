import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';
import { useScheduleExecutionWarning } from '@/composables/useScheduleExecutionWarning';
import { useVibes } from '@/composables/useVibes';
import { SCHEDULE_EXECUTION_WARNING_MESSAGE } from '@/utils/automation-summary';
import ScheduleFormPage from '@/views/ScheduleFormPage.vue';
import type { Vibe } from '@/services/vibe.service';

/**
 * Integration-level check for the ADR-036 Decision 5 warning wiring in
 * ScheduleFormPage.vue.
 *
 * The full derivation (which providers/actions produce the warning) is
 * exhaustively covered by useScheduleExecutionWarning.test.ts in isolation.
 * These tests instead prove the PAGE renders that composable's state
 * correctly and — critically — never lets it block submission. Ionic's
 * `onIonViewWillEnter` hook only fires inside a real `ion-router-outlet`
 * transition, which a plain `mount()` never triggers (same constraint as
 * DevicesPage.test.ts), so `fetchVibes()`/`getSchedule()` never run here —
 * the composable singletons are pre-seeded directly instead.
 */

function vibe(partial: Partial<Vibe> & { id: number }): Vibe {
  return {
    name: 'A vibe',
    description: null,
    thumbnail_url: null,
    card_image_url: null,
    player_background_url: null,
    artwork_url: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    scene_id: null,
    ...partial,
  };
}

/** Mounts ScheduleFormPage.vue in "new schedule" mode inside a real router. */
async function mountScheduleFormPage() {
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

  await router.push('/schedules/new');
  await router.isReady();

  const wrapper = mount(ScheduleFormPage, {
    global: { plugins: [router] },
  });

  return { wrapper, router };
}

beforeEach(() => {
  const { vibes } = useVibes();
  const { hasUnschedulableActions } = useScheduleExecutionWarning();
  vibes.value = [vibe({ id: 1, name: 'Focus', scene_id: 10 })];
  hasUnschedulableActions.value = false;
});

afterEach(() => {
  const { hasUnschedulableActions } = useScheduleExecutionWarning();
  hasUnschedulableActions.value = false;
});

describe('ScheduleFormPage — schedule execution warning (ADR-036 Decision 5)', () => {
  it('does not render the warning banner when the composable reports no unschedulable actions', async () => {
    const { wrapper } = await mountScheduleFormPage();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain(SCHEDULE_EXECUTION_WARNING_MESSAGE);
  });

  it('renders the centralized warning copy (role="status") when the composable reports an unschedulable action', async () => {
    const { wrapper } = await mountScheduleFormPage();
    await wrapper.vm.$nextTick();

    // Mounting itself re-derives (and resets) the warning for form.vibe_id
    // (null at this point) — same guard that clears stale state left over
    // from a previous page visit. Flip it here, post-mount, to prove the
    // template reacts to the composable's (singleton) state correctly.
    const { hasUnschedulableActions } = useScheduleExecutionWarning();
    hasUnschedulableActions.value = true;
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('.schedule-execution-warning');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('role')).toBe('status');
    expect(banner.text()).toBe(SCHEDULE_EXECUTION_WARNING_MESSAGE);
  });

  it('never adds `disabled` to the submit button on account of the warning alone', async () => {
    // Hold every other submit-gating condition fixed (offline=false,
    // submitting=false, form validity untouched) and flip ONLY the warning
    // flag — the disabled state of the submit button must not change.
    const { hasUnschedulableActions } = useScheduleExecutionWarning();

    const { wrapper } = await mountScheduleFormPage();
    await wrapper.vm.$nextTick();

    hasUnschedulableActions.value = false;
    await wrapper.vm.$nextTick();
    const disabledWithoutWarning = wrapper.find('.auth-submit').attributes('disabled');

    hasUnschedulableActions.value = true;
    await wrapper.vm.$nextTick();
    const disabledWithWarning = wrapper.find('.auth-submit').attributes('disabled');

    expect(disabledWithWarning).toBe(disabledWithoutWarning);
  });
});
