import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { mount } from '@vue/test-utils';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockRegisterTapHandler,
  mockAcknowledge,
  mockIsOffline,
} = vi.hoisted(() => ({
  mockRegisterTapHandler: vi.fn(),
  mockAcknowledge: vi.fn(),
  mockIsOffline: vi.fn<[], boolean>(() => false),
}));

vi.mock('@/services/schedule-notification.service', () => ({
  scheduleNotificationService: {
    registerTapHandler: mockRegisterTapHandler,
  },
}));

vi.mock('@/services/schedule-execution.service', () => ({
  scheduleExecutionService: {
    acknowledgeScheduleExecution: mockAcknowledge,
  },
}));

vi.mock('@/services/schedule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/schedule.service')>();
  return { ...actual, isDeviceOffline: mockIsOffline };
});

import {
  _resetInitializedForTest,
  useScheduleNotificationHandler,
} from '@/composables/useScheduleNotificationHandler';
import type { ScheduleNotificationExtra } from '@/services/schedule-notification/schedule-notification.adapter';

// ── Helpers ───────────────────────────────────────────────────────────────────

type TapHandler = (extra: ScheduleNotificationExtra) => void;

/**
 * Mount the composable inside a real Vue app with a router.
 * Returns the router and a function to retrieve the captured tap handler.
 */
function mountWithRouter(): { router: ReturnType<typeof createRouter>; getCapturedHandler: () => TapHandler | null } {
  let capturedHandler: TapHandler | null = null;

  mockRegisterTapHandler.mockImplementation(async (cb: TapHandler) => {
    capturedHandler = cb;
  });

  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', component: defineComponent({ template: '<div/>' }) },
      { path: '/vibes/:id/player', component: defineComponent({ template: '<div/>' }) },
    ],
  });

  mount(
    defineComponent({
      setup() {
        useScheduleNotificationHandler();
      },
      template: '<div/>',
    }),
    { global: { plugins: [router] } },
  );

  return { router, getCapturedHandler: () => capturedHandler };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useScheduleNotificationHandler — notification tap behaviour', () => {
  beforeEach(() => {
    _resetInitializedForTest();
    mockRegisterTapHandler.mockReset();
    mockAcknowledge.mockReset();
    mockIsOffline.mockReturnValue(false);
    mockAcknowledge.mockResolvedValue(undefined as unknown as void);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers a tap handler on mount', () => {
    mountWithRouter();
    expect(mockRegisterTapHandler).toHaveBeenCalledOnce();
  });

  it('does not register a second tap handler if called again (singleton guard)', () => {
    mountWithRouter();
    // Second composable call — reset mocks but NOT _initialized
    mockRegisterTapHandler.mockReset();

    mount(
      defineComponent({
        setup() { useScheduleNotificationHandler(); },
        template: '<div/>',
      }),
      { global: { plugins: [createRouter({ history: createWebHashHistory(), routes: [{ path: '/', component: defineComponent({ template: '<div/>' }) }] })] } },
    );

    expect(mockRegisterTapHandler).not.toHaveBeenCalled();
  });

  it('calls acknowledgeScheduleExecution when online and occurrence_key is present', async () => {
    const { getCapturedHandler } = mountWithRouter();

    const extra: ScheduleNotificationExtra = {
      schedule_id: 7,
      vibe_id: 3,
      schedule_name: 'Morning',
      occurrence_key: '7:1749820000',
    };

    const handler = getCapturedHandler();
    expect(handler).not.toBeNull();
    handler!(extra);

    // Allow microtasks / promises to flush
    await vi.waitFor(() => expect(mockAcknowledge).toHaveBeenCalledOnce());
    expect(mockAcknowledge).toHaveBeenCalledWith(7, '7:1749820000');
  });

  it('skips ack when device is offline', async () => {
    mockIsOffline.mockReturnValue(true);
    const { getCapturedHandler } = mountWithRouter();

    const extra: ScheduleNotificationExtra = {
      schedule_id: 7,
      vibe_id: 3,
      schedule_name: 'Morning',
      occurrence_key: '7:1749820000',
    };

    getCapturedHandler()!(extra);

    // Give promises time to run
    await new Promise((r) => setTimeout(r, 10));
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('skips ack when occurrence_key is absent (pre-Phase-11 notification)', async () => {
    const { getCapturedHandler } = mountWithRouter();

    const extra: ScheduleNotificationExtra = {
      schedule_id: 7,
      vibe_id: 3,
      schedule_name: 'Morning',
      // no occurrence_key
    };

    getCapturedHandler()!(extra);

    await new Promise((r) => setTimeout(r, 10));
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('does not throw when ack fails (best-effort — swallows error)', async () => {
    mockAcknowledge.mockRejectedValueOnce(new Error('Network error'));
    const { getCapturedHandler } = mountWithRouter();

    const extra: ScheduleNotificationExtra = {
      schedule_id: 7,
      vibe_id: 3,
      schedule_name: 'Morning',
      occurrence_key: '7:1749820000',
    };

    // Should not throw
    expect(() => getCapturedHandler()!(extra)).not.toThrow();

    // Wait for the rejected promise to be handled silently
    await vi.waitFor(() => expect(mockAcknowledge).toHaveBeenCalledOnce());
  });
});
