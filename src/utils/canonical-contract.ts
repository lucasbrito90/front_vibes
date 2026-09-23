/**
 * Vendored canonical smart-home contract metadata (ADR-037 §10).
 *
 * The declarative source of truth is
 * `contracts/smart-home/capability.v1.schema.json` (byte-identical to
 * ixora-infra). Runtime code reads this module; the schema file is validated
 * in Vitest by capability-contract-coherence.test.ts.
 */

/** Semver — must match the schema's `x-contract-version` field. */
export const CANONICAL_CONTRACT_VERSION = '1.0.0';

export const CANONICAL_SCHEMA_RELATIVE_PATH = 'contracts/smart-home/capability.v1.schema.json';

/** Fixed brightness range (ADR-037 §5) — not a provider mapper choice. */
export const CANONICAL_BRIGHTNESS_RANGE = {
  min: 0,
  max: 100,
  step: 1,
  unit: 'percent',
} as const;

/** Closed capability id vocabulary (schema `$defs.capabilityId.enum`). */
export const CANONICAL_CAPABILITY_IDS = [
  'power',
  'brightness',
  'energy',
  'current_temperature',
  'target_temperature',
  'hvac_mode',
] as const;

/** Closed operation vocabulary (schema `$defs.operation.enum`). */
export const CANONICAL_OPERATIONS = ['on', 'off', 'toggle', 'set'] as const;

/** Closed access vocabulary (schema `$defs.access.enum`). */
export const CANONICAL_ACCESS_LEVELS = ['read', 'write', 'read_write'] as const;

/** Numeric units (schema `$defs.numberConstraint.properties.unit.enum`). */
export const CANONICAL_NUMBER_UNITS = ['percent', 'kWh', 'celsius'] as const;
