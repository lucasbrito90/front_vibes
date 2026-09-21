import { isDeviceOffline } from './provider-connection.service';
import { sceneActionExecutionReportService } from './scene-action-execution-report.service';
import type { SceneActionExecutionOutcome } from './scene-action-execution-report.service';
import { sceneDeviceActionService } from './scene-device-action.service';
import type { SceneDeviceAction } from './scene-device-action.service';
import { googleHomeService } from './google-home.service';
import type { GoogleHomeExecuteAction } from './google-home.service';
import { createLogger } from '@/utils/player-debug';

/**
 * google-home-execution.service.ts
 *
 * The device-side half of ADR-036 Decision 7: given the `device_action_ids`
 * returned by POST /api/scenes/{id}/execute or
 * POST /api/vibes/{id}/smart-home/dispatch, resolves each action's device,
 * translates its `action_type` to the Google Home plugin's action
 * vocabulary, executes it via google-home.service.ts, measures duration, and
 * reports the outcome to POST /api/scene-action-executions/report — always,
 * success or failure, per ADR-036 Decision 7 ("a client may only report on
 * its own user's actions" — a silent failure is worse than a recorded one).
 *
 * Built once, wired into both entry points a user can hit ADR-036 Decision 7
 * from: manual Scene execution (ScenesPage.vue) and Vibe play
 * (VibePlayerPage.vue via smart-home-dispatch.service.ts).
 *
 * Hard boundaries (never relaxed, mirrors smart-home-dispatch.service.ts):
 * - Fire-and-forget: `executeDeviceSideActions()` never throws. Every
 *   internal step is wrapped so one action's failure can never stop another
 *   action's execution/report, and this module's failure can never reach a
 *   caller in a way that could interrupt audio.
 * - Platform gate: `googleHomeService.isGoogleHomeSupported()` is checked
 *   once, up front. Outside native Android this function executes nothing
 *   and reports nothing — there is no result to invent.
 * - Offline: resolving WHICH device/action to run requires
 *   `sceneDeviceActionService.listSceneDeviceActions()`, a network call
 *   against this app's own backend — so this implementation cannot start
 *   the device-side flow at all while offline, not only skip the report.
 *   This is a deliberate, documented consequence of resolving action
 *   metadata via the API rather than requiring every call site to pass
 *   already-loaded action objects; it is checked again immediately before
 *   each report call in case connectivity drops mid-flight.
 * - GH-COMPLIANCE: `provider_device_id` is never logged. The debug log below
 *   only ever carries `scene_action_id` and the translated action verb.
 *
 * Delays (PO decision, 20/09/2026 — option (a)): `delay_seconds` is honored
 * here, per action and absolute from the moment execution starts, never
 * cumulative along `sort_order`. The backend applies the same rule when it
 * enqueues a SceneActionJob, so a delay does not change meaning with the
 * device's provider — exactly the divergence the canonical model (ADR-037)
 * exists to prevent, and exactly what fixing only the server-side half would
 * have created. Before this, every device-side action fired at once: two
 * actions delayed 100s and 1s were observed executing 4ms apart on a physical
 * device.
 *
 * Delays here are plain timers, so they last only as long as the app is alive.
 * On the Vibe-play path the audio foreground service already keeps it alive;
 * on manual Scene execution the action editor warns above
 * LONG_DELAY_WARNING_SECONDS rather than promising something the runtime
 * cannot deliver. Native scheduling (WorkManager) was considered and rejected
 * as disproportionate to the gain.
 */

const log = createLogger('GoogleHomeExecution');

export interface DeviceSideExecutionInput {
  sceneExecutionId: string;
  /** scene_action_id values the backend returned as device-side work. */
  deviceActionIds: number[];
}

/**
 * Translates the legacy wire `action_type` (ActionType) to the Google Home
 * plugin's own action vocabulary (GoogleHomePlugin.kt `SUPPORTED_ACTIONS`).
 * Returns null for any value neither side declares — treated as
 * `unsupported`, never as a thrown error.
 */
function translateActionType(actionType: string): GoogleHomeExecuteAction | null {
  switch (actionType) {
    case 'turn_on':
      return 'on';
    case 'turn_off':
      return 'off';
    case 'toggle':
      return 'toggle';
    case 'set_brightness':
      return 'set_brightness';
    default:
      return null;
  }
}

/** The canonical percentage value (ADR-037 §5) stored under SceneAction.parameters.value. */
function extractBrightnessPercent(parameters: SceneDeviceAction['parameters']): number | undefined {
  const value = parameters?.value;
  return typeof value === 'number' ? value : undefined;
}

/**
 * The delay above which a device-side action needs the app to stay open for it
 * to run at all. Exported so the action editor warns at the same threshold the
 * runtime is actually bound by, rather than a second number that can drift.
 */
export const LONG_DELAY_WARNING_SECONDS = 60;

/**
 * Resolves after `seconds`, or immediately when there is nothing to wait for.
 *
 * A plain timer: it does not survive the app being killed, which is why the
 * editor warns about long device-side delays instead of the runtime pretending
 * otherwise.
 */
function wait(seconds: number): Promise<void> {
  if (!(seconds > 0)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

/** A non-negative delay, whatever the API sent. */
function delayFor(action: SceneDeviceAction): number {
  const raw = Number(action.delay_seconds);

  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Execution order: by delay first, then `sort_order`.
 *
 * `sort_order` alone stops being enough once delays are honored — an action
 * ordered first but delayed 100s must not hold back one ordered second with no
 * delay. Sorting by delay makes the waiting monotonic, and `sort_order` stays
 * the tie-break among actions due at the same moment, which is the only case
 * where the user's ordering is still observable.
 */
function inExecutionOrder(actions: SceneDeviceAction[]): SceneDeviceAction[] {
  return [...actions].sort(
    (a, b) => delayFor(a) - delayFor(b) || a.sort_order - b.sort_order,
  );
}

/**
 * Reports one outcome. Never throws — a report failure is logged and
 * swallowed, exactly like every other step in this module. Re-checks the
 * offline gate immediately before sending, since connectivity may have
 * dropped since `executeDeviceSideActions()` started.
 */
async function tryReport(
  sceneExecutionId: string,
  sceneActionId: number,
  outcome: SceneActionExecutionOutcome,
  durationMs: number | null,
): Promise<void> {
  if (isDeviceOffline()) {
    log.debug('tryReport: offline — skipping report.', { sceneActionId, outcome });
    return;
  }

  try {
    await sceneActionExecutionReportService.reportSceneActionExecution({
      scene_execution_id: sceneExecutionId,
      scene_action_id: sceneActionId,
      outcome,
      duration_ms: durationMs,
    });
  } catch (err) {
    log.debug('tryReport: report failed — ignoring.', { sceneActionId, outcome, err });
  }
}

/**
 * Executes one device-side action and always reports an outcome. Every
 * failure path (untranslatable action_type, missing device, plugin
 * rejection) still reports — per ADR-036 Decision 7, a silent failure is
 * worse than a recorded one.
 */
async function executeOneAction(action: SceneDeviceAction, sceneExecutionId: string): Promise<void> {
  const op = translateActionType(action.action_type);

  if (op === null) {
    log.debug('executeOneAction: untranslatable action_type — reporting unsupported.', {
      sceneActionId: action.id,
    });
    await tryReport(sceneExecutionId, action.id, 'unsupported', null);
    return;
  }

  const device = action.device;
  if (!device?.provider_device_id) {
    log.debug('executeOneAction: no resolvable device — reporting unsupported.', {
      sceneActionId: action.id,
    });
    await tryReport(sceneExecutionId, action.id, 'unsupported', null);
    return;
  }

  let value: number | undefined;
  if (op === 'set_brightness') {
    value = extractBrightnessPercent(action.parameters);
    if (value === undefined) {
      log.debug('executeOneAction: set_brightness with no canonical value — reporting failure.', {
        sceneActionId: action.id,
      });
      await tryReport(sceneExecutionId, action.id, 'failure', null);
      return;
    }
  }

  const startedAt = Date.now();
  try {
    await googleHomeService.executeAction(device.provider_device_id, op, value);
    const durationMs = Date.now() - startedAt;
    log.debug('executeOneAction: plugin succeeded.', { sceneActionId: action.id, action: op });
    await tryReport(sceneExecutionId, action.id, 'success', durationMs);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    log.debug('executeOneAction: plugin rejected — reporting failure.', {
      sceneActionId: action.id,
      action: op,
      err,
    });
    await tryReport(sceneExecutionId, action.id, 'failure', durationMs);
  }
}

/**
 * Executes and reports every action in `deviceActionIds`. Fetches full
 * action details (device, action_type, parameters) for the whole scene in
 * one request, then filters to the requested ids — the same shape the
 * backend already uses for `device_action_ids` (scene_action_id only).
 *
 * Never throws. Safe to call fire-and-forget from a UI event handler; every
 * caller in this app additionally wraps the call in `.catch(() => {})` as a
 * defence-in-depth measure, matching smart-home-dispatch.service.ts's
 * precedent, but this function itself never rejects.
 */
async function executeDeviceSideActions(sceneId: number, input: DeviceSideExecutionInput): Promise<void> {
  const { sceneExecutionId, deviceActionIds } = input;

  if (deviceActionIds.length === 0) {
    return;
  }

  if (!googleHomeService.isGoogleHomeSupported()) {
    log.debug('executeDeviceSideActions: platform unsupported — skipping entirely (no execution, no report).');
    return;
  }

  // Resolving which device/action to run requires an API call against this
  // app's own backend — offline blocks the whole flow here, not only the
  // report (see module docblock).
  if (isDeviceOffline()) {
    log.debug('executeDeviceSideActions: offline — skipping entirely (cannot resolve action metadata).');
    return;
  }

  let actions: SceneDeviceAction[];
  try {
    actions = await sceneDeviceActionService.listSceneDeviceActions(sceneId);
  } catch (err) {
    log.debug('executeDeviceSideActions: could not resolve scene actions — skipping.', { sceneId, err });
    return;
  }

  const targets = inExecutionOrder(
    actions.filter((action) => deviceActionIds.includes(action.id)),
  );

  // Sequential rather than Promise.all: waiting is only meaningful if each
  // action's turn actually arrives in order, and running them one at a time
  // makes the relative ordering a guarantee instead of a scheduling accident.
  // `elapsed` is measured from the start, so each delay stays absolute — a slow
  // plugin call shortens the next wait rather than pushing every later action
  // back, which is what would quietly turn option (a) into cumulative delays.
  const startedAt = Date.now();

  for (const action of targets) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;

    await wait(delayFor(action) - elapsedSeconds);
    await executeOneAction(action, sceneExecutionId);
  }
}

export const googleHomeExecutionService = {
  executeDeviceSideActions,
};
