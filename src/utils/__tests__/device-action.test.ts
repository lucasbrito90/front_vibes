import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  MAX_DELAY_SECONDS,
  actionTypeLabel,
  actionTypeOptions,
  isMvpActionType,
  isValidActionDraft,
  validateActionDraft,
} from '@/utils/device-action';

describe('device-action utils', () => {
  it('exposes only the three MVP action types', () => {
    expect(ACTION_TYPES).toEqual(['turn_on', 'turn_off', 'toggle']);
  });

  it('labels action types in a human-friendly way', () => {
    expect(actionTypeLabel('turn_on')).toBe('Turn on');
    expect(actionTypeLabel('turn_off')).toBe('Turn off');
    expect(actionTypeLabel('toggle')).toBe('Toggle');
  });

  it('falls back to the raw value for unknown types', () => {
    expect(actionTypeLabel('set_brightness')).toBe('set_brightness');
  });

  it('builds picker options for MVP types only', () => {
    expect(actionTypeOptions()).toEqual([
      { value: 'turn_on', label: 'Turn on' },
      { value: 'turn_off', label: 'Turn off' },
      { value: 'toggle', label: 'Toggle' },
    ]);
  });

  it('recognises MVP action types and rejects others', () => {
    expect(isMvpActionType('toggle')).toBe(true);
    expect(isMvpActionType('set_color')).toBe(false);
    expect(isMvpActionType(undefined)).toBe(false);
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

    it('rejects non-MVP action types', () => {
      const errors = validateActionDraft({
        device_id: 1,
        // @ts-expect-error — intentionally invalid for the test
        action_type: 'set_brightness',
        delay_seconds: 0,
      });
      expect(errors.action_type).toBeTruthy();
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
