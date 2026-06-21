import type { ActionType, VibeDeviceActionPayload } from '@/services/vibe-device-action.service';

/** MVP-allowed action types. Future types are intentionally not exposed in the UI. */
export const ACTION_TYPES: readonly ActionType[] = ['turn_on', 'turn_off', 'toggle'] as const;

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
    default:
      return String(type);
  }
}

/** Options for the action type picker (MVP only). */
export function actionTypeOptions(): ActionTypeOption[] {
  return ACTION_TYPES.map((value) => ({ value, label: actionTypeLabel(value) }));
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
export function validateActionDraft(draft: VibeDeviceActionPayload): ActionValidationErrors {
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
export function isValidActionDraft(draft: VibeDeviceActionPayload): boolean {
  return Object.keys(validateActionDraft(draft)).length === 0;
}
