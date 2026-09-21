import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Precedent: useGoogleHomeDiscovery.test.ts — mock the SERVICE modules this
// module consumes, never the raw Capacitor plugin. There is no precedent (and
// this task does not create one) for mocking the plugin directly.

const {
  mockIsGoogleHomeSupported,
  mockExecuteAction,
  mockListSceneDeviceActions,
  mockReportSceneActionExecution,
  mockIsDeviceOffline,
} = vi.hoisted(() => ({
  mockIsGoogleHomeSupported: vi.fn((): boolean => true),
  mockExecuteAction: vi.fn(),
  mockListSceneDeviceActions: vi.fn(),
  mockReportSceneActionExecution: vi.fn(),
  mockIsDeviceOffline: vi.fn((): boolean => false),
}));

vi.mock('@/services/google-home.service', () => ({
  googleHomeService: {
    isGoogleHomeSupported: mockIsGoogleHomeSupported,
    executeAction: mockExecuteAction,
  },
}));

vi.mock('@/services/scene-device-action.service', () => ({
  sceneDeviceActionService: {
    listSceneDeviceActions: mockListSceneDeviceActions,
  },
}));

vi.mock('@/services/scene-action-execution-report.service', () => ({
  sceneActionExecutionReportService: {
    reportSceneActionExecution: mockReportSceneActionExecution,
  },
}));

vi.mock('@/services/provider-connection.service', () => ({
  isDeviceOffline: mockIsDeviceOffline,
}));

import { googleHomeExecutionService } from '@/services/google-home-execution.service';
import type { SceneDeviceAction, SceneDeviceActionDevice } from '@/services/scene-device-action.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCENE_ID = 7;
const SCENE_EXECUTION_ID = 'exec-uuid-abc';

function device(
  partial: Partial<SceneDeviceActionDevice> & { provider: string },
): SceneDeviceActionDevice {
  return {
    id: 1,
    name: 'Kitchen Light',
    type: 'lighting',
    status: 'unknown',
    provider_device_id: 'gh-device-1',
    capabilities: null,
    ...partial,
  };
}

function action(
  partial: Partial<SceneDeviceAction> & { id: number },
): SceneDeviceAction {
  return {
    scene_id: SCENE_ID,
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

beforeEach(() => {
  mockIsGoogleHomeSupported.mockReset().mockReturnValue(true);
  mockExecuteAction.mockReset();
  mockListSceneDeviceActions.mockReset();
  mockReportSceneActionExecution.mockReset().mockResolvedValue(undefined);
  mockIsDeviceOffline.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Guards ────────────────────────────────────────────────────────────────────

describe('executeDeviceSideActions — guards', () => {
  it('does nothing when deviceActionIds is empty', async () => {
    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [],
    });

    expect(mockIsGoogleHomeSupported).not.toHaveBeenCalled();
    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
  });

  it('executes nothing and reports nothing when the platform is unsupported', async () => {
    mockIsGoogleHomeSupported.mockReturnValue(false);

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).not.toHaveBeenCalled();
  });

  it('executes nothing and reports nothing while offline', async () => {
    mockIsDeviceOffline.mockReturnValue(true);

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    expect(mockListSceneDeviceActions).not.toHaveBeenCalled();
    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).not.toHaveBeenCalled();
  });

  it('never throws when listSceneDeviceActions rejects', async () => {
    mockListSceneDeviceActions.mockRejectedValue(new Error('network down'));

    await expect(
      googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
        sceneExecutionId: SCENE_EXECUTION_ID,
        deviceActionIds: [1],
      }),
    ).resolves.toBeUndefined();

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).not.toHaveBeenCalled();
  });
});

// ── Success / failure execution ───────────────────────────────────────────────

describe('executeDeviceSideActions — execution outcomes', () => {
  it('reports success when the plugin resolves', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, action_type: 'turn_on', device: device({ provider: 'google_home' }) }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    expect(mockExecuteAction).toHaveBeenCalledWith('gh-device-1', 'on', undefined);
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        scene_execution_id: SCENE_EXECUTION_ID,
        scene_action_id: 1,
        outcome: 'success',
      }),
    );
  });

  it('reports the failure outcome when the plugin rejects, and never throws', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 2, action_type: 'toggle', device: device({ provider: 'google_home' }) }),
    ]);
    mockExecuteAction.mockRejectedValue(new Error('Device not found'));

    await expect(
      googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
        sceneExecutionId: SCENE_EXECUTION_ID,
        deviceActionIds: [2],
      }),
    ).resolves.toBeUndefined();

    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        scene_execution_id: SCENE_EXECUTION_ID,
        scene_action_id: 2,
        outcome: 'failure',
      }),
    );
  });

  it('never lets a report failure throw out of executeDeviceSideActions', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 3, action_type: 'turn_off', device: device({ provider: 'google_home' }) }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });
    mockReportSceneActionExecution.mockRejectedValue(new Error('report endpoint down'));

    await expect(
      googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
        sceneExecutionId: SCENE_EXECUTION_ID,
        deviceActionIds: [3],
      }),
    ).resolves.toBeUndefined();
  });

  it('only executes actions matching the given deviceActionIds — ignores other scene actions', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 1, action_type: 'turn_on', device: device({ provider: 'google_home' }) }),
      action({ id: 2, action_type: 'turn_on', device: device({ provider: 'home_assistant' }) }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    expect(mockExecuteAction).toHaveBeenCalledTimes(1);
    expect(mockReportSceneActionExecution).toHaveBeenCalledTimes(1);
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 1 }),
    );
  });
});

// ── set_brightness — canonical percent value ──────────────────────────────────

describe('executeDeviceSideActions — set_brightness', () => {
  it('sends the canonical percent value from parameters.value, never a provider scale', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 4,
        action_type: 'set_brightness',
        parameters: { value: 42 },
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [4],
    });

    expect(mockExecuteAction).toHaveBeenCalledWith('gh-device-1', 'set_brightness', 42);
  });

  it('reports failure without calling the plugin when set_brightness has no canonical value', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 5,
        action_type: 'set_brightness',
        parameters: null,
        device: device({ provider: 'google_home' }),
      }),
    ]);

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [5],
    });

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 5, outcome: 'failure' }),
    );
  });
});

// ── Untranslatable action_type / missing device ───────────────────────────────

describe('executeDeviceSideActions — unsupported shapes', () => {
  it('reports unsupported for an action_type the plugin vocabulary does not recognise, without calling the plugin', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 6, action_type: 'set_color', device: device({ provider: 'google_home' }) }),
    ]);

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [6],
    });

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 6, outcome: 'unsupported' }),
    );
  });

  it('reports unsupported when the action has no resolvable device', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 7, action_type: 'turn_on', device: undefined }),
    ]);

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [7],
    });

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 7, outcome: 'unsupported' }),
    );
  });
});

// ── Provider-neutrality — no slug comparison at any decision point ───────────

describe('executeDeviceSideActions — provider neutrality', () => {
  it('executes and reports regardless of the device provider slug — the backend already decided this is device-side work', async () => {
    const fictionalSlug = 'totally_made_up_vendor_xyz';
    mockListSceneDeviceActions.mockResolvedValue([
      action({ id: 8, action_type: 'turn_on', device: device({ provider: fictionalSlug }) }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [8],
    });

    // No `if (device.provider === 'google_home')` gate anywhere in this
    // module — it executes whatever the backend flagged as device-side,
    // regardless of the provider slug attached to the resolved device.
    expect(mockExecuteAction).toHaveBeenCalledWith('gh-device-1', 'on', undefined);
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 8, outcome: 'success' }),
    );
  });
});
