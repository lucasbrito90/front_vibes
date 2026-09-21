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

// ── delay_seconds — the device-side half of the delay fix ────────────────────
//
// `delay_seconds` was validated, persisted, exposed by the API and editable in
// the app since v1.3.0, and honored by nobody. On a physical device, two
// actions delayed 100s and 1s were observed executing 4ms apart.
//
// Semantics (PO decision, 20/09/2026 — option (a)): per action, absolute from
// the moment execution starts, never cumulative along sort_order. The backend
// applies the same rule when it enqueues, so the delay a user sets does not
// change meaning with the device's provider.

describe('executeDeviceSideActions — delay_seconds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The verbs the plugin was actually driven with, in the order it saw them. */
  function executedVerbs(): string[] {
    return mockExecuteAction.mock.calls.map((call) => String(call[1]));
  }

  it('does not execute a delayed action before its delay elapses', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: 30,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(mockExecuteAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(mockExecuteAction).toHaveBeenCalledTimes(1);

    await run;
  });

  it('executes an undelayed action without waiting for a timer', async () => {
    // Guards the path every existing scene takes today: a zero delay must
    // behave exactly as it did before this change.
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: 0,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    expect(mockExecuteAction).toHaveBeenCalledTimes(1);
  });

  it('treats each delay as absolute from the start, not cumulative', async () => {
    // The distinguishing assertion for option (a): both actions are due at
    // +10s. Under cumulative semantics the second would run at +20s.
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: 10,
        sort_order: 0,
        device: device({ provider: 'google_home' }),
      }),
      action({
        id: 2,
        action_type: 'turn_off',
        delay_seconds: 10,
        sort_order: 1,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1, 2],
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(executedVerbs()).toEqual(['on', 'off']);

    await run;
  });

  it('reproduces the observed defect: a long delay no longer drags a short one with it', async () => {
    // The exact scene from the physical evidence — turn_on at 100s and
    // set_brightness at 1s, which fired 4ms apart before this fix.
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: 100,
        sort_order: 0,
        device: device({ provider: 'google_home' }),
      }),
      action({
        id: 2,
        action_type: 'set_brightness',
        parameters: { value: 87 },
        delay_seconds: 1,
        sort_order: 1,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1, 2],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(executedVerbs()).toEqual(['set_brightness']);

    await vi.advanceTimersByTimeAsync(99_000);
    expect(executedVerbs()).toEqual(['set_brightness', 'on']);

    await run;
  });

  it('keeps sort_order as the tie-break between actions due at the same moment', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'set_brightness',
        parameters: { value: 50 },
        delay_seconds: 5,
        sort_order: 2,
        device: device({ provider: 'google_home' }),
      }),
      action({
        id: 2,
        action_type: 'turn_on',
        delay_seconds: 5,
        sort_order: 1,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1, 2],
    });

    await vi.advanceTimersByTimeAsync(5_000);

    // Turning a lamp on after setting its brightness is a different outcome
    // from doing it the other way round, so the tie-break is not cosmetic.
    expect(executedVerbs()).toEqual(['on', 'set_brightness']);

    await run;
  });

  it('still reports the outcome of a delayed action', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 9,
        action_type: 'turn_on',
        delay_seconds: 7,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [9],
    });

    await vi.advanceTimersByTimeAsync(7_000);
    await run;

    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 9, outcome: 'success' }),
    );
  });

  it('does not wait on a malformed delay', async () => {
    // The API sends an integer, but a nonsense value must not stall an action
    // forever — an action that never runs is worse than one that runs at once.
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: Number.NaN,
        device: device({ provider: 'google_home' }),
      }),
      action({
        id: 2,
        action_type: 'turn_off',
        delay_seconds: -5,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1, 2],
    });

    expect(mockExecuteAction).toHaveBeenCalledTimes(2);
  });

  it('never throws out of a delayed action that fails', async () => {
    mockListSceneDeviceActions.mockResolvedValue([
      action({
        id: 1,
        action_type: 'turn_on',
        delay_seconds: 3,
        device: device({ provider: 'google_home' }),
      }),
    ]);
    mockExecuteAction.mockRejectedValue(new Error('Device not found'));

    const run = googleHomeExecutionService.executeDeviceSideActions(SCENE_ID, {
      sceneExecutionId: SCENE_EXECUTION_ID,
      deviceActionIds: [1],
    });

    await vi.advanceTimersByTimeAsync(3_000);

    await expect(run).resolves.toBeUndefined();
    expect(mockReportSceneActionExecution).toHaveBeenCalledWith(
      expect.objectContaining({ scene_action_id: 1, outcome: 'failure' }),
    );
  });
});
