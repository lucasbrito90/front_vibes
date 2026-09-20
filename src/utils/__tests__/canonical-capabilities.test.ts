import { describe, expect, it } from 'vitest';
import {
  actionTakesValue,
  actionValueLabel,
  buildParameters,
  capabilityForAction,
  constraintForAction,
  defaultValueFor,
  parseCapabilities,
  supportedActionTypes,
  validateCanonicalValue,
  type CanonicalCapability,
  type CanonicalConstraint,
} from '@/utils/canonical-capabilities';

/*
 * CSDM-06 — reading the canonical contract on the client (ADR-037 §2-§5).
 *
 * What this replaces: the app used to decide what a device could do by looking
 * for the literal string `can_turn_on`. A capability carrying a value had
 * nowhere to declare its limits, which is why set_brightness existed in the
 * backend for a whole release and never reached the UI.
 */

/** The canonical envelope a device carries after re-syncing (CSDM-03/CSDM-04). */
function canonicalLamp(): Record<string, unknown> {
  return {
    contract_version: '1.0.0',
    capabilities: {
      power: {
        id: 'power',
        access: 'read_write',
        operations: ['on', 'off', 'toggle'],
        constraints: { type: 'boolean' },
      },
      brightness: {
        id: 'brightness',
        access: 'read_write',
        operations: ['set'],
        constraints: { type: 'number', min: 0, max: 100, step: 1, unit: 'percent' },
      },
    },
  };
}

/** The ADR-033 shape a device still carries before it re-syncs. */
function legacyLamp(): Record<string, unknown> {
  return {
    can_turn_on: {},
    can_turn_off: {},
    can_toggle: {},
    can_set_brightness: { min: 0, max: 255, step: 1 },
  };
}

describe('parseCapabilities', () => {
  it('reads the canonical envelope', () => {
    const parsed = parseCapabilities(canonicalLamp());

    expect(parsed?.map((c) => c.id)).toEqual(['power', 'brightness']);
  });

  it('reads a legacy map so a device that has not re-synced still works', () => {
    const parsed = parseCapabilities(legacyLamp());

    expect(parsed?.map((c) => c.id)).toEqual(['power', 'brightness']);
    expect(parsed?.[0].operations).toEqual(['on', 'off', 'toggle']);
  });

  it('replaces legacy brightness bounds with the canonical range', () => {
    // The legacy 0-255 is a provider scale that leaked into what was meant to
    // be domain data. Rendering a slider from it would put that scale in front
    // of the user — the exact leak this layer exists to stop.
    const parsed = parseCapabilities(legacyLamp());
    const brightness = parsed?.find((c) => c.id === 'brightness');

    expect(brightness?.constraints).toEqual({
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      unit: 'percent',
    });
  });

  it('distinguishes unknown from empty', () => {
    // null means capabilities were never derived → fail open.
    expect(parseCapabilities(null)).toBeNull();
    expect(parseCapabilities(undefined)).toBeNull();

    // {} means the provider reported a device that declares nothing → offer
    // nothing. Collapsing the two would re-enable every action on a device
    // that genuinely supports none.
    expect(parseCapabilities({})).toEqual([]);
  });
});

describe('supportedActionTypes', () => {
  it('derives actions from declared operations, not from hardcoded keys', () => {
    const actions = supportedActionTypes(parseCapabilities(canonicalLamp()));

    expect(actions).toContain('turn_on');
    expect(actions).toContain('turn_off');
    expect(actions).toContain('toggle');
    expect(actions).toContain('set_brightness');
  });

  it('offers only the operations a capability actually declares', () => {
    // A media player that can be powered but not toggled, exactly as the
    // Home Assistant mapper reports it.
    const mediaPlayer: CanonicalCapability[] = [
      { id: 'power', access: 'read_write', operations: ['on', 'off'], constraints: { type: 'boolean' } },
    ];

    const actions = supportedActionTypes(mediaPlayer);

    expect(actions).toEqual(['turn_on', 'turn_off']);
    expect(actions).not.toContain('toggle');
  });

  it('never offers to command a read-only measurement', () => {
    const plug: CanonicalCapability[] = [
      { id: 'power', access: 'read_write', operations: ['on', 'off'], constraints: { type: 'boolean' } },
      {
        id: 'energy',
        access: 'read',
        operations: [],
        constraints: { type: 'number', min: 0, max: null, step: 0.01, unit: 'kWh' },
      },
    ];

    expect(supportedActionTypes(plug)).toEqual(['turn_on', 'turn_off']);
  });

  it('fails open when capabilities are unknown', () => {
    expect(supportedActionTypes(null)).toEqual([
      'turn_on',
      'turn_off',
      'toggle',
      'set_brightness',
    ]);
  });
});

describe('constraintForAction', () => {
  it('returns the constraint governing a value-carrying action', () => {
    const constraint = constraintForAction(parseCapabilities(canonicalLamp()), 'set_brightness');

    expect(constraint).toEqual({ type: 'number', min: 0, max: 100, step: 1, unit: 'percent' });
  });

  it('returns null for an action that carries no value', () => {
    expect(constraintForAction(parseCapabilities(canonicalLamp()), 'turn_on')).toBeNull();
    expect(actionTakesValue('turn_on')).toBe(false);
    expect(actionTakesValue('set_brightness')).toBe(true);
  });

  it('resolves the capability behind an action', () => {
    expect(capabilityForAction(parseCapabilities(canonicalLamp()), 'toggle')?.id).toBe('power');
  });

  it('labels the value control from the capability, not the action', () => {
    expect(actionValueLabel('set_brightness')).toBe('Brightness');
  });
});

describe('validateCanonicalValue', () => {
  const brightness: CanonicalConstraint = {
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    unit: 'percent',
  };

  it('accepts a value inside the canonical range', () => {
    expect(validateCanonicalValue(brightness, 65, 'Brightness')).toBeNull();
  });

  it('rejects a value above the maximum, in canonical units', () => {
    expect(validateCanonicalValue(brightness, 9999, 'Brightness')).toContain('at most 100 percent');
  });

  it('rejects a value off the step grid', () => {
    const halfDegrees: CanonicalConstraint = {
      type: 'number',
      min: 5,
      max: 35,
      step: 0.5,
      unit: 'celsius',
    };

    expect(validateCanonicalValue(halfDegrees, 21.5, 'Target temperature')).toBeNull();
    expect(validateCanonicalValue(halfDegrees, 21.3, 'Target temperature')).toContain(
      'increments of 0.5',
    );
  });

  it('skips a bound the provider never declared', () => {
    // ADR-037 §4: null means not known, so the check degrades to type checking
    // rather than defaulting — matching the backend exactly.
    const unbounded: CanonicalConstraint = {
      type: 'number',
      min: null,
      max: null,
      step: null,
      unit: 'celsius',
    };

    expect(validateCanonicalValue(unbounded, 900, 'Temperature')).toBeNull();
    expect(validateCanonicalValue(unbounded, 'warm', 'Temperature')).toContain('must be a number');
  });

  it('enforces enum membership', () => {
    const mode: CanonicalConstraint = { type: 'enum', allowed_values: ['off', 'heat', 'cool'] };

    expect(validateCanonicalValue(mode, 'heat', 'Mode')).toBeNull();
    expect(validateCanonicalValue(mode, 'turbo', 'Mode')).toContain('off, heat, cool');
  });

  it('accepts anything when there is no constraint to check against', () => {
    expect(validateCanonicalValue(null, 12345)).toBeNull();
  });
});

describe('buildParameters', () => {
  it('sends the canonical key, never a provider-shaped one', () => {
    expect(buildParameters('set_brightness', 65)).toEqual({ value: 65 });
  });

  it('sends nothing for an operation that takes no value', () => {
    // A stale control must never leak a parameter into a turn_off.
    expect(buildParameters('turn_off', 65)).toBeNull();
    expect(buildParameters('set_brightness', null)).toBeNull();
  });
});

describe('defaultValueFor', () => {
  it('seeds a numeric control at its declared minimum', () => {
    expect(defaultValueFor({ type: 'number', min: 5, max: 35, step: 0.5, unit: 'celsius' })).toBe(5);
  });

  it('seeds an enum control at its first allowed value', () => {
    expect(defaultValueFor({ type: 'enum', allowed_values: ['off', 'heat'] })).toBe('off');
  });

  it('seeds nothing when there is no constraint', () => {
    expect(defaultValueFor(null)).toBeNull();
  });
});

describe('provider neutrality', () => {
  it('never surfaces a provider scale, however the device was reported', () => {
    for (const payload of [canonicalLamp(), legacyLamp()]) {
      const serialized = JSON.stringify(parseCapabilities(payload));

      expect(serialized).not.toContain('255');
      expect(serialized).not.toContain('254');
      expect(serialized.toLowerCase()).not.toContain('home_assistant');
      expect(serialized.toLowerCase()).not.toContain('google');
    }
  });
});
