import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Same pattern as useSceneDeviceActions.test.ts / useGoogleHomeDiscovery.test.ts:
// mock the SERVICE modules this composable consumes, let the real (singleton)
// useVibes()/useProviderTypes() composables run against pre-seeded state.

const { mockListSceneDeviceActions, mockGetProviderTypes, mockIsDeviceOffline } = vi.hoisted(
  () => ({
    mockListSceneDeviceActions: vi.fn(),
    mockGetProviderTypes: vi.fn(),
    mockIsDeviceOffline: vi.fn((): boolean => false),
  }),
);

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

vi.mock('@/services/schedule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/schedule.service')>();
  return {
    ...actual,
    isDeviceOffline: mockIsDeviceOffline,
  };
});

import { useProviderTypes } from '@/composables/useProviderTypes';
import { useScheduleExecutionWarning } from '@/composables/useScheduleExecutionWarning';
import { useVibes } from '@/composables/useVibes';
import type {
  SceneDeviceAction,
  SceneDeviceActionDevice,
} from '@/services/scene-device-action.service';
import type { Vibe } from '@/services/vibe.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

/** Google Home does not declare scheduled_execution — this is what today makes it non-schedulable. */
const googleHomeProviderType = {
  slug: 'google_home',
  label: 'Google Home',
  config: {},
  credentials: {},
  execution_capabilities: ['device_discovery', 'state_read', 'interactive_execution'],
};

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

function device(partial: Partial<SceneDeviceActionDevice> & { provider: string }): SceneDeviceActionDevice {
  return {
    id: 1,
    name: 'Device',
    type: null,
    status: 'unknown',
    provider_device_id: 'abc-123',
    capabilities: null,
    ...partial,
  };
}

function action(
  partial: Partial<SceneDeviceAction> & { id: number },
): SceneDeviceAction {
  return {
    scene_id: 10,
    device_id: partial.device?.id ?? 1,
    action_type: 'turn_on',
    parameters: null,
    sort_order: 0,
    delay_seconds: 0,
    created_at: null,
    updated_at: null,
    ...partial,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  const { vibes } = useVibes();
  const { providerTypes } = useProviderTypes();
  const { hasUnschedulableActions } = useScheduleExecutionWarning();

  vibes.value = [];
  providerTypes.value = [homeAssistantProviderType, googleHomeProviderType];
  hasUnschedulableActions.value = false;

  mockListSceneDeviceActions.mockReset();
  mockGetProviderTypes.mockReset().mockResolvedValue([homeAssistantProviderType, googleHomeProviderType]);
  mockIsDeviceOffline.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useScheduleExecutionWarning — schedulable actions', () => {
  it('shows no warning when every action targets a scheduled_execution provider (Home Assistant)', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: device({ provider: 'home_assistant' }) }),
      action({ id: 2, device: device({ provider: 'home_assistant' }) }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(false);
  });
});

describe('useScheduleExecutionWarning — non-schedulable actions', () => {
  it('warns when mixing a scheduled_execution provider with one that lacks it', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: device({ provider: 'home_assistant' }) }),
      action({ id: 2, device: device({ provider: 'google_home' }) }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(true);
  });

  it('warns when every action is non-schedulable', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: device({ provider: 'google_home' }) }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(true);
  });

  it('treats an unknown provider slug (no descriptor at all) as non-schedulable', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: device({ provider: 'totally_unregistered_provider' }) }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(true);
  });
});

describe('useScheduleExecutionWarning — no-scene vibes', () => {
  it('does not warn and never requests scene actions for a vibe without a scene_id', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 2, scene_id: null })];

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(2);

    expect(hasUnschedulableActions.value).toBe(false);
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
  });

  it('does not warn when no vibe is selected', async () => {
    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(null);

    expect(hasUnschedulableActions.value).toBe(false);
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
  });
});

describe('useScheduleExecutionWarning — devices without a resolved device', () => {
  it('ignores actions whose device is absent/null and does not count them as incompatible', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: undefined }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(false);
  });
});

describe('useScheduleExecutionWarning — error handling (fail silent)', () => {
  it('fails silently (no warning) when fetching scene actions throws, and logs the failure', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockRejectedValue(new Error('Network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await expect(evaluate(1)).resolves.toBeUndefined();

    expect(hasUnschedulableActions.value).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('fails silently (no warning, no scene-action request) when provider types are not cached and fetching them fails', async () => {
    const { vibes } = useVibes();
    const { providerTypes } = useProviderTypes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    providerTypes.value = [];
    mockGetProviderTypes.mockRejectedValue(new Error('Network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await expect(evaluate(1)).resolves.toBeUndefined();

    expect(hasUnschedulableActions.value).toBe(false);
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('useScheduleExecutionWarning — offline', () => {
  it('never fetches anything while the device is offline', async () => {
    mockIsDeviceOffline.mockReturnValue(true);
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 })];

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();
    await evaluate(1);

    expect(hasUnschedulableActions.value).toBe(false);
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
    expect(mockGetProviderTypes).not.toHaveBeenCalled();
  });
});

describe('useScheduleExecutionWarning — race safety on vibe change', () => {
  it('discards a stale (slow) evaluation for an abandoned vibe once a newer vibe has been evaluated', async () => {
    const { vibes } = useVibes();
    vibes.value = [vibe({ id: 1, scene_id: 10 }), vibe({ id: 2, scene_id: 20 })];

    let resolveSlow!: (value: SceneDeviceAction[]) => void;
    const slow = new Promise<SceneDeviceAction[]>((resolve) => {
      resolveSlow = resolve;
    });
    mockListSceneDeviceActions.mockImplementation((sceneId: number) =>
      sceneId === 10 ? slow : Promise.resolve([]),
    );

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();

    const staleEvaluation = evaluate(1); // slow — will eventually resolve with a non-schedulable action.
    await evaluate(2); // fast — vibe 2 has no actions at all, no warning.

    expect(hasUnschedulableActions.value).toBe(false);

    // Now the stale (vibe 1) response arrives, with a non-schedulable device action.
    resolveSlow([action({ id: 1, device: device({ provider: 'google_home' }) })]);
    await staleEvaluation;

    // Must still reflect vibe 2's (no-warning) outcome — the stale vibe-1
    // response must never overwrite the state set by the newer evaluation.
    expect(hasUnschedulableActions.value).toBe(false);
  });
});

describe('useScheduleExecutionWarning — capability neutrality guard', () => {
  it('derives the decision purely from execution_capabilities, never from the provider slug', async () => {
    const { vibes } = useVibes();
    const { providerTypes } = useProviderTypes();
    const fictionalSlug = 'totally_made_up_vendor_xyz';
    vibes.value = [vibe({ id: 1, scene_id: 10 })];
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, device: device({ provider: fictionalSlug }) }),
    ]);

    const { evaluate, hasUnschedulableActions } = useScheduleExecutionWarning();

    // A fictional provider that DOES declare scheduled_execution → no warning,
    // even though its slug has never been seen anywhere in this codebase.
    providerTypes.value = [
      {
        slug: fictionalSlug,
        label: 'Made Up Vendor',
        config: {},
        credentials: {},
        execution_capabilities: ['scheduled_execution'],
      },
    ];
    await evaluate(1);
    expect(hasUnschedulableActions.value).toBe(false);

    // Same exact slug, but now without the capability → must warn. Proves
    // the capability list — not the slug — drives the outcome.
    providerTypes.value = [
      {
        slug: fictionalSlug,
        label: 'Made Up Vendor',
        config: {},
        credentials: {},
        execution_capabilities: [],
      },
    ];
    await evaluate(1);
    expect(hasUnschedulableActions.value).toBe(true);
  });
});
