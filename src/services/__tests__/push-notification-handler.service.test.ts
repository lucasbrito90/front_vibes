import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'vue-router';

// ── Hoisted mock variables ────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest.

const { mockIsNativePlatform, mockAddListener } = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn<[], boolean>().mockReturnValue(true),
  mockAddListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mockIsNativePlatform },
}));

vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: { addListener: mockAddListener },
}));

import {
  _resetTapHandlerForTest,
  initPushNotificationTapHandler,
  pushNotificationHandlerService,
  resolveRouteForType,
  ROUTE_BY_NOTIFICATION_TYPE,
} from '@/services/push-notification-handler.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

type TapListener = (event: {
  actionId: string;
  notification: { data?: unknown };
}) => void;

interface MockRouter {
  isReady: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
}

function makeRouter(overrides: Partial<MockRouter> = {}): Router {
  return {
    isReady: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Router;
}

/** Return the tap listener captured by the most recent addListener call. */
function capturedListener(): TapListener {
  const lastCall = mockAddListener.mock.calls.at(-1);
  if (!lastCall) throw new Error('addListener was not called');
  return lastCall[1] as TapListener;
}

/** Flush pending microtasks so the async navigate handler completes. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function tapEvent(data: unknown): { actionId: string; notification: { data?: unknown } } {
  return { actionId: 'tap', notification: { data } };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsNativePlatform.mockReturnValue(true);
  mockAddListener.mockResolvedValue({ remove: vi.fn() });
  _resetTapHandlerForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Navigation mapping ──────────────────────────────────────────────────────────

describe('navigation mapping', () => {
  it('maps schedule_execution_failed to /schedules', () => {
    expect(resolveRouteForType('schedule_execution_failed')).toBe('/schedules');
  });

  it('maps smart_home_action_failed to /devices', () => {
    expect(resolveRouteForType('smart_home_action_failed')).toBe('/devices');
  });

  it('maps smart_home_provider_unreachable to /devices', () => {
    expect(resolveRouteForType('smart_home_provider_unreachable')).toBe('/devices');
  });

  it('maps account_security_notice to /settings', () => {
    expect(resolveRouteForType('account_security_notice')).toBe('/settings');
  });

  it('returns null for unknown type', () => {
    expect(resolveRouteForType('totally_unknown')).toBeNull();
  });

  it('returns null for undefined type', () => {
    expect(resolveRouteForType(undefined)).toBeNull();
  });

  it('exposes the mapping table with exactly the four supported types', () => {
    expect(Object.keys(ROUTE_BY_NOTIFICATION_TYPE).sort()).toEqual(
      [
        'account_security_notice',
        'schedule_execution_failed',
        'smart_home_action_failed',
        'smart_home_provider_unreachable',
      ].sort(),
    );
  });
});

// ── Foreground tap ──────────────────────────────────────────────────────────────

describe('foreground tap', () => {
  it('navigates immediately to the mapped route', async () => {
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ type: 'smart_home_action_failed', device_id: '5' }));
    await flush();

    expect(router.push).toHaveBeenCalledWith('/devices');
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('waits for the router to be ready before pushing', async () => {
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ type: 'schedule_execution_failed' }));
    await flush();

    expect(router.isReady).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/schedules');
  });
});

// ── Background tap ──────────────────────────────────────────────────────────────

describe('background tap', () => {
  it('navigates once when resumed from background', async () => {
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ type: 'account_security_notice' }));
    await flush();

    expect(router.push).toHaveBeenCalledWith('/settings');
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

// ── Cold start ──────────────────────────────────────────────────────────────────

describe('cold start', () => {
  it('navigates after the router becomes ready (no race condition)', async () => {
    let resolveReady: () => void = () => {};
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const router = makeRouter({ isReady: vi.fn().mockReturnValue(readyPromise) });

    initPushNotificationTapHandler(router);
    capturedListener()(tapEvent({ type: 'smart_home_provider_unreachable' }));
    await flush();

    // Router not ready yet → no navigation.
    expect(router.push).not.toHaveBeenCalled();

    // Router becomes ready → navigation proceeds.
    resolveReady();
    await flush();

    expect(router.push).toHaveBeenCalledWith('/devices');
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

// ── Unknown / missing type ──────────────────────────────────────────────────────

describe('unknown and missing types', () => {
  it('does not navigate and logs a warning for an unknown type', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ type: 'mystery_type' }));
    await flush();

    expect(router.push).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('does not navigate and logs a warning when type is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ device_id: '9' }));
    await flush();

    expect(router.push).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('does not navigate when data is null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent(null));
    await flush();

    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not throw on any malformed payload', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    const listener = capturedListener();
    expect(() => listener(tapEvent('not-an-object'))).not.toThrow();
    await flush();

    expect(router.push).not.toHaveBeenCalled();
  });
});

// ── Singleton registration ──────────────────────────────────────────────────────

describe('singleton registration', () => {
  it('registers the listener exactly once even when init is called repeatedly', () => {
    const router = makeRouter();

    initPushNotificationTapHandler(router);
    initPushNotificationTapHandler(router);
    initPushNotificationTapHandler(router);

    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });

  it('registers for the notificationActionPerformed event', () => {
    initPushNotificationTapHandler(makeRouter());

    expect(mockAddListener).toHaveBeenCalledWith(
      'notificationActionPerformed',
      expect.any(Function),
    );
  });

  it('does not register duplicated listeners across taps', async () => {
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(tapEvent({ type: 'schedule_execution_failed' }));
    capturedListener()(tapEvent({ type: 'smart_home_action_failed' }));
    await flush();

    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(2);
  });
});

// ── Platform guard ──────────────────────────────────────────────────────────────

describe('platform guard', () => {
  it('is a no-op on web / non-native platforms', () => {
    mockIsNativePlatform.mockReturnValue(false);

    initPushNotificationTapHandler(makeRouter());

    expect(mockAddListener).not.toHaveBeenCalled();
  });
});

// ── Safe logging ────────────────────────────────────────────────────────────────

describe('safe logging', () => {
  it('logs only type, route, and timestamp — never body, token, or user data', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const router = makeRouter();
    initPushNotificationTapHandler(router);

    capturedListener()(
      tapEvent({
        type: 'smart_home_action_failed',
        device_id: 'secret-device',
        vibe_id: 'secret-vibe',
      }),
    );
    await flush();

    expect(info).toHaveBeenCalled();
    const logged = JSON.stringify(info.mock.calls);

    expect(logged).toContain('smart_home_action_failed');
    expect(logged).toContain('/devices');
    expect(logged).toContain('timestamp');
    // No leaked payload fields.
    expect(logged).not.toContain('secret-device');
    expect(logged).not.toContain('secret-vibe');
    expect(logged.toLowerCase()).not.toContain('token');
    expect(logged.toLowerCase()).not.toContain('body');
  });
});

// ── Public service object ──────────────────────────────────────────────────────

describe('public service object', () => {
  it('exposes initPushNotificationTapHandler and resolveRouteForType', () => {
    expect(typeof pushNotificationHandlerService.initPushNotificationTapHandler).toBe('function');
    expect(typeof pushNotificationHandlerService.resolveRouteForType).toBe('function');
  });
});
