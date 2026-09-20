import type { ActionType, SceneDeviceActionPayload } from '@/services/scene-device-action.service';
import { parseCapabilities, supportedActionTypes } from '@/utils/canonical-capabilities';

export type { ActionType };

/**
 * Action types the UI can render.
 *
 * `set_brightness` joins the list in CSDM-06. It has existed in the backend
 * since v1.4.0 and was excluded here for a concrete reason, not an arbitrary
 * one: the editor had no way to know a brightness runs 0 to 100, so it could
 * not have rendered a control for it. The canonical contract supplies that
 * now (ADR-037 §5), so the capability finally reaches the user.
 */
export const ACTION_TYPES: readonly ActionType[] = [
  'turn_on',
  'turn_off',
  'toggle',
  'set_brightness',
] as const;

/** Maximum delay allowed per action (1 hour), mirroring the backend constraint. */
export const MAX_DELAY_SECONDS = 3600;

export interface ActionTypeOption {
  value: ActionType;
  label: string;
}

/** Human-friendly label for an action type. */
export function actionTypeLabel(type: ActionType | string): string {
  switch (type) {
    case 'turn_on':
      return 'Turn on';
    case 'turn_off':
      return 'Turn off';
    case 'toggle':
      return 'Toggle';
    case 'set_brightness':
      return 'Set brightness';
    default:
      return String(type);
  }
}

/** Options for the action type picker (MVP only). */
export function actionTypeOptions(): ActionTypeOption[] {
  return ACTION_TYPES.map((value) => ({ value, label: actionTypeLabel(value) }));
}



/**
 * Returns the action type options allowed for a device, read from its
 * canonical capability contract (CSDM-06):
 *
 * - capabilities === null / undefined → **never block** — return all options.
 * - otherwise → only actions the device's capabilities actually declare an
 *   operation for, and only on capabilities whose access permits writing.
 *
 * Additionally, if `currentActionType` is supplied (edit mode), that option
 * is always included in the result even when the capability is absent — so
 * an existing saved action is never silently hidden from the editor. When
 * the current type is already allowed by capabilities, it is NOT duplicated.
 */
export function availableActionTypeOptions(
  capabilities: unknown,
  currentActionType?: ActionType | null,
): ActionTypeOption[] {
  // CSDM-06: derived from the device's declared capabilities and operations
  // rather than from hardcoded `can_*` keys, so a capability added to the
  // contract reaches the user without an app change. Fail-open is unchanged:
  // unknown capabilities offer everything (ADR-033 §5).
  const parsed = parseCapabilities(capabilities);
  const supported = supportedActionTypes(parsed);

  const allowed = ACTION_TYPES.filter((type) => supported.includes(type)).map((value) => ({
    value,
    label: actionTypeLabel(value),
  }));

  // Always include currentActionType (edit mode) even if capability is absent,
  // but don't duplicate it when it is already in the allowed list.
  if (
    currentActionType != null &&
    isMvpActionType(currentActionType) &&
    !allowed.some((opt) => opt.value === currentActionType)
  ) {
    allowed.push({ value: currentActionType, label: actionTypeLabel(currentActionType) });
  }

  return allowed;
}

/** True when the value is an MVP-supported action type. */
export function isMvpActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

export type ActionValidationField = 'device_id' | 'action_type' | 'delay_seconds';
export type ActionValidationErrors = Partial<Record<ActionValidationField, string>>;

/**
 * Validate a device action draft for the add/edit form.
 * - device required
 * - action_type required + MVP only
 * - delay_seconds integer in [0, MAX_DELAY_SECONDS]
 */
export function validateActionDraft(draft: SceneDeviceActionPayload): ActionValidationErrors {
  const errors: ActionValidationErrors = {};

  if (draft.device_id == null || !Number.isInteger(draft.device_id) || draft.device_id <= 0) {
    errors.device_id = 'Select a device.';
  }

  if (draft.action_type == null) {
    errors.action_type = 'Select an action.';
  } else if (!isMvpActionType(draft.action_type)) {
    errors.action_type = 'Unsupported action type.';
  }

  const delay = draft.delay_seconds ?? 0;
  if (!Number.isInteger(delay) || delay < 0) {
    errors.delay_seconds = 'Delay must be a whole number ≥ 0.';
  } else if (delay > MAX_DELAY_SECONDS) {
    errors.delay_seconds = `Delay must be ≤ ${MAX_DELAY_SECONDS} seconds.`;
  }

  return errors;
}

/** True when the draft has no validation errors. */
export function isValidActionDraft(draft: SceneDeviceActionPayload): boolean {
  return Object.keys(validateActionDraft(draft)).length === 0;
}
