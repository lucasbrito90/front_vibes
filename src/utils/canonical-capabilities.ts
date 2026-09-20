/**
 * Reading the canonical capability contract on the client (CSDM-06).
 *
 * Until now the app decided what a device could do by looking for the string
 * `can_turn_on` and its siblings — a hardcoded mirror of the backend's ADR-033
 * map, which meant every new capability required editing the app. Worse, a
 * capability that carried a *value* had nowhere to put its limits, so
 * `set_brightness` existed in the backend since v1.4.0 and simply never
 * appeared in the UI: the editor had no way to know a brightness runs 0 to 100.
 *
 * This module reads the contract instead (ADR-037 §2-§5). Operations come from
 * the device's declared capabilities, and the control a user sees is derived
 * from the constraint — so adding a compatible capability to the contract
 * surfaces it here without a line of UI change.
 *
 * Provider neutrality is structural, not a convention: nothing in this file
 * mentions a provider, a service name, or a native scale. A brightness is a
 * percentage because the domain says so; that Home Assistant thinks in 0-255
 * and Google in 0-254 is converted away long before it reaches this layer.
 */

import type { ActionType } from '@/services/scene-device-action.service';

/** Canonical value constraint — mirrors the shared JSON Schema's tagged union. */
export type CanonicalConstraint =
  | { type: 'number'; min: number | null; max: number | null; step: number | null; unit: string }
  | { type: 'enum'; allowed_values: string[] }
  | { type: 'boolean' };

/** One canonical capability of a device. */
export interface CanonicalCapability {
  id: string;
  access: 'read' | 'write' | 'read_write';
  operations: string[];
  constraints: CanonicalConstraint | null;
}

/**
 * The wire `action_type` each canonical (capability, operation) pair denotes.
 *
 * The inverse of the backend's `ActionTypeTranslation`. The API still speaks
 * `action_type`; CSDM-07 retires the field, and this table is the one place
 * that needs to change when it does — not every component that builds a form.
 */
const WIRE_ACTION: Record<string, ActionType> = {
  'power:on': 'turn_on',
  'power:off': 'turn_off',
  'power:toggle': 'toggle',
  'brightness:set': 'set_brightness',
};

/** Human-readable label per capability, for controls and error messages. */
const CAPABILITY_LABEL: Record<string, string> = {
  power: 'Power',
  brightness: 'Brightness',
  energy: 'Energy',
  current_temperature: 'Current temperature',
  target_temperature: 'Target temperature',
  hvac_mode: 'Mode',
};

/** Reverse lookup: which capability and operation a wire action denotes. */
const ACTION_CANONICAL: Record<string, { capability: string; operation: string }> =
  Object.fromEntries(
    Object.entries(WIRE_ACTION).map(([pair, action]) => {
      const [capability, operation] = pair.split(':');
      return [action, { capability, operation }];
    }),
  );

/**
 * Parses whatever shape `device.capabilities` currently carries.
 *
 * Three cases, because the ADR-037 §8 transition window is still open:
 * the canonical envelope (authoritative), the legacy `can_*` map (a device
 * that has not re-synced yet), and null — which means *unknown*, not
 * *nothing*, and must keep failing open exactly as ADR-033 §5 requires.
 */
export function parseCapabilities(raw: unknown): CanonicalCapability[] | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Record<string, unknown>;

  if (typeof payload.contract_version === 'string' && typeof payload.capabilities === 'object') {
    const entries = payload.capabilities as Record<string, unknown>;

    return Object.values(entries).filter(isCanonicalCapability);
  }

  return parseLegacyMap(payload);
}

/**
 * Builds the legacy `can_*` map into canonical capabilities, so a device that
 * has not re-synced since CSDM-03/CSDM-04 still drives a schema-driven UI.
 *
 * The legacy brightness bounds are deliberately discarded and replaced by the
 * canonical range: they are a provider scale (0-255) that leaked into what was
 * meant to be domain data, and rendering a slider from them would put that
 * scale in front of the user — the exact leak this layer exists to stop.
 */
function parseLegacyMap(payload: Record<string, unknown>): CanonicalCapability[] {
  const powerOperations: string[] = [];

  if ('can_turn_on' in payload) powerOperations.push('on');
  if ('can_turn_off' in payload) powerOperations.push('off');
  if ('can_toggle' in payload) powerOperations.push('toggle');

  const capabilities: CanonicalCapability[] = [];

  if (powerOperations.length > 0) {
    capabilities.push({
      id: 'power',
      access: 'read_write',
      operations: powerOperations,
      constraints: { type: 'boolean' },
    });
  }

  if ('can_set_brightness' in payload) {
    capabilities.push({
      id: 'brightness',
      access: 'read_write',
      operations: ['set'],
      constraints: { type: 'number', min: 0, max: 100, step: 1, unit: 'percent' },
    });
  }

  // An object that declares nothing is NOT the same as unknown: `{}` means the
  // provider reported a device with no capabilities, which must offer no
  // actions, while `null` means they were never derived and must fail open.
  // Collapsing the two would silently re-enable every action on a device that
  // genuinely supports none.
  return capabilities;
}

function isCanonicalCapability(entry: unknown): entry is CanonicalCapability {
  if (entry === null || typeof entry !== 'object') {
    return false;
  }

  const candidate = entry as Record<string, unknown>;

  return typeof candidate.id === 'string' && Array.isArray(candidate.operations);
}

/**
 * The wire action types a device supports, derived from its capabilities.
 *
 * Fail-open (ADR-033 §5, kept by ADR-037 §8): a device whose capabilities were
 * never derived offers everything, because unknown is not the same as
 * unsupported and silently disabling a working device is worse than offering
 * an action the provider may refuse.
 *
 * A capability whose access forbids writing contributes nothing — `energy` is
 * a measurement, and the editor must not offer to command it.
 */
export function supportedActionTypes(capabilities: CanonicalCapability[] | null): ActionType[] {
  if (capabilities === null) {
    return Object.values(WIRE_ACTION);
  }

  const actions: ActionType[] = [];

  for (const capability of capabilities) {
    if (capability.access === 'read') {
      continue;
    }

    for (const operation of capability.operations) {
      const action = WIRE_ACTION[`${capability.id}:${operation}`];

      if (action !== undefined && !actions.includes(action)) {
        actions.push(action);
      }
    }
  }

  return actions;
}

/** The capability governing a wire action's value, when it has one. */
export function capabilityForAction(
  capabilities: CanonicalCapability[] | null,
  action: ActionType | string,
): CanonicalCapability | null {
  const canonical = ACTION_CANONICAL[action];

  if (canonical === undefined || capabilities === null) {
    return null;
  }

  return capabilities.find((capability) => capability.id === canonical.capability) ?? null;
}

/**
 * The constraint a wire action's parameter must satisfy, or null when the
 * action takes no parameter (`turn_on` and friends) or the device declares
 * none.
 */
export function constraintForAction(
  capabilities: CanonicalCapability[] | null,
  action: ActionType | string,
): CanonicalConstraint | null {
  const canonical = ACTION_CANONICAL[action];

  if (canonical === undefined || canonical.operation !== 'set') {
    return null;
  }

  return capabilityForAction(capabilities, action)?.constraints ?? null;
}

/** Whether a wire action carries a value the user must choose. */
export function actionTakesValue(action: ActionType | string): boolean {
  return ACTION_CANONICAL[action]?.operation === 'set';
}

/** Human label for the capability a wire action drives. */
export function actionValueLabel(action: ActionType | string): string {
  const capability = ACTION_CANONICAL[action]?.capability;

  return capability === undefined ? 'Value' : (CAPABILITY_LABEL[capability] ?? capability);
}

/**
 * Validates a value against a canonical constraint, mirroring the backend's
 * CommandValidator.
 *
 * This is UX, never the authority: Laravel validates every write regardless,
 * and a null bound is skipped here exactly as it is there (ADR-037 §4), so the
 * two layers agree instead of one quietly being stricter.
 *
 * @returns an error message, or null when the value is acceptable
 */
export function validateCanonicalValue(
  constraint: CanonicalConstraint | null,
  value: unknown,
  label = 'Value',
): string | null {
  if (constraint === null) {
    return null;
  }

  if (constraint.type === 'boolean') {
    return typeof value === 'boolean' ? null : `${label} must be true or false.`;
  }

  if (constraint.type === 'enum') {
    return typeof value === 'string' && constraint.allowed_values.includes(value)
      ? null
      : `${label} must be one of: ${constraint.allowed_values.join(', ')}.`;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `${label} must be a number.`;
  }

  if (constraint.min !== null && value < constraint.min) {
    return `${label} must be at least ${constraint.min} ${constraint.unit}.`;
  }

  if (constraint.max !== null && value > constraint.max) {
    return `${label} must be at most ${constraint.max} ${constraint.unit}.`;
  }

  if (constraint.step !== null && constraint.step > 0) {
    const origin = constraint.min ?? 0;
    const steps = (value - origin) / constraint.step;

    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return `${label} must be set in increments of ${constraint.step} ${constraint.unit}.`;
    }
  }

  return null;
}

/**
 * The parameters payload for a wire action.
 *
 * `value` is the canonical parameter key (ADR-037 §12). The app never sends a
 * provider-shaped key, and never a provider-scaled number — the mapper on the
 * far side converts once, at the only boundary that knows the provider exists.
 */
export function buildParameters(
  action: ActionType | string,
  value: number | string | boolean | null,
): Record<string, unknown> | null {
  if (!actionTakesValue(action) || value === null) {
    return null;
  }

  return { value };
}

/** A sensible starting value for a control the user has not touched yet. */
export function defaultValueFor(constraint: CanonicalConstraint | null): number | string | null {
  if (constraint === null) {
    return null;
  }

  if (constraint.type === 'enum') {
    return constraint.allowed_values[0] ?? null;
  }

  if (constraint.type === 'number') {
    return constraint.min ?? 0;
  }

  return null;
}
