import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  MAX_DELAY_SECONDS,
  actionTypeLabel,
  actionTypeOptions,
  availableActionTypeOptions,
  isMvpActionType,
  isValidActionDraft,
  validateActionDraft,
} from '@/utils/device-action';

describe('device-action utils', () => {
  it('exposes the action types the UI can render, brightness included', () => {
    // set_brightness joins in CSDM-06: it existed in the backend since v1.4.0
    // and was excluded here only because the editor had no way to know its
    // range. The canonical contract supplies that now.
    expect(ACTION_TYPES).toEqual(['turn_on', 'turn_off', 'toggle', 'set_brightness']);
  });

  it('labels action types in a human-friendly way', () => {
    expect(actionTypeLabel('turn_on')).toBe('Turn on');
    expect(actionTypeLabel('turn_off')).toBe('Turn off');
    expect(actionTypeLabel('toggle')).toBe('Toggle');
    expect(actionTypeLabel('set_brightness')).toBe('Set brightness');
  });

  it('falls back to the raw value for unknown types', () => {
    expect(actionTypeLabel('set_color')).toBe('set_color');
  });

  it('builds picker options for every renderable type', () => {
    expect(actionTypeOptions()).toEqual([
      { value: 'turn_on', label: 'Turn on' },
      { value: 'turn_off', label: 'Turn off' },
      { value: 'toggle', label: 'Toggle' },
      { value: 'set_brightness', label: 'Set brightness' },
    ]);
  });

  it('recognises renderable action types and rejects others', () => {
    expect(isMvpActionType('toggle')).toBe(true);
    expect(isMvpActionType('set_brightness')).toBe(true);
    expect(isMvpActionType('set_color')).toBe(false);
    expect(isMvpActionType(undefined)).toBe(false);
  });

  describe('availableActionTypeOptions — fail-open capability filtering', () => {
    it('returns every option when capabilities is null (fail-open)', () => {
      const opts = availableActionTypeOptions(null);
      expect(opts.map((o) => o.value)).toEqual(['turn_on', 'turn_off', 'toggle', 'set_brightness']);
    });

    it('returns every option when capabilities is undefined (fail-open)', () => {
      const opts = availableActionTypeOptions(undefined);
      expect(opts.map((o) => o.value)).toEqual(['turn_on', 'turn_off', 'toggle', 'set_brightness']);
    });

    it('returns only the options whose required capability key is present', () => {
      const caps = { can_turn_on: {}, can_turn_off: {} }; // no can_toggle
      const opts = availableActionTypeOptions(caps);
      expect(opts.map((o) => o.value)).toEqual(['turn_on', 'turn_off']);
    });

    it('returns empty list when capabilities is an empty map', () => {
      const opts = availableActionTypeOptions({});
      expect(opts).toEqual([]);
    });

    it('always includes currentActionType even when its capability is absent', () => {
      const caps = { can_turn_on: {} }; // only turn_on allowed
      const opts = availableActionTypeOptions(caps, 'toggle');
      const values = opts.map((o) => o.value);
      expect(values).toContain('turn_on');
      expect(values).toContain('toggle'); // preserved from edit
      expect(values).not.toContain('turn_off'); // genuinely blocked
    });

    it('does not duplicate currentActionType when it is already allowed by capabilities', () => {
      const caps = { can_turn_on: {}, can_toggle: {} };
      const opts = availableActionTypeOptions(caps, 'toggle');
      const toggleEntries = opts.filter((o) => o.value === 'toggle');
      expect(toggleEntries).toHaveLength(1); // no duplicate
    });

    it('does not add currentActionType when it is null', () => {
      const caps = { can_turn_on: {} };
      const opts = availableActionTypeOptions(caps, null);
      expect(opts.map((o) => o.value)).toEqual(['turn_on']);
    });

    it('does not add currentActionType when capabilities is null (already all included)', () => {
      const opts = availableActionTypeOptions(null, 'toggle');
      expect(opts.map((o) => o.value)).toEqual(['turn_on', 'turn_off', 'toggle', 'set_brightness']);
    });
  });

  describe('validateActionDraft', () => {
    it('passes a valid draft', () => {
      const errors = validateActionDraft({
        device_id: 4,
        action_type: 'turn_on',
        delay_seconds: 30,
      });
      expect(errors).toEqual({});
      expect(isValidActionDraft({ device_id: 4, action_type: 'turn_on', delay_seconds: 30 })).toBe(
        true,
      );
    });

    it('requires a device', () => {
      const errors = validateActionDraft({ action_type: 'turn_on', delay_seconds: 0 });
      expect(errors.device_id).toBeTruthy();
    });

    it('requires an action type', () => {
      const errors = validateActionDraft({ device_id: 1, delay_seconds: 0 });
      expect(errors.action_type).toBeTruthy();
    });

    it('rejects action types the UI cannot render', () => {
      const errors = validateActionDraft({
        device_id: 1,
        // @ts-expect-error — intentionally invalid for the test
        action_type: 'set_color',
        delay_seconds: 0,
      });
      expect(errors.action_type).toBeTruthy();
    });

    it('accepts set_brightness, which CSDM-06 brings into the UI', () => {
      const errors = validateActionDraft({
        device_id: 1,
        action_type: 'set_brightness',
        delay_seconds: 0,
      });
      expect(errors.action_type).toBeUndefined();
    });

    it('rejects negative delay', () => {
      const errors = validateActionDraft({
        device_id: 1,
        action_type: 'turn_on',
        delay_seconds: -1,
      });
      expect(errors.delay_seconds).toBeTruthy();
    });

    it(`rejects delay over ${MAX_DELAY_SECONDS}`, () => {
      const errors = validateActionDraft({
        device_id: 1,
        action_type: 'turn_on',
        delay_seconds: MAX_DELAY_SECONDS + 1,
      });
      expect(errors.delay_seconds).toBeTruthy();
    });

    it('rejects non-integer delay', () => {
      const errors = validateActionDraft({
        device_id: 1,
        action_type: 'turn_on',
        delay_seconds: 1.5,
      });
      expect(errors.delay_seconds).toBeTruthy();
    });
  });
});
