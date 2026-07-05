import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_ACTIVE_LABEL,
  AUTOMATION_ENABLED_LABEL,
  NO_ACTIVE_SCHEDULES_LABEL,
  NO_SMART_HOME_ACTIONS_LABEL,
} from '@/utils/automation-summary';
import {
  automationBadge,
  scheduleAutomationBadge,
  vibeAutomationBadge,
  type AutomationBadge,
} from '@/utils/automation-badges';

// Every badge must carry readable text + a semantic icon (never color-only).
function expectValidBadge(badge: AutomationBadge): void {
  expect(typeof badge.label).toBe('string');
  expect(badge.label.length).toBeGreaterThan(0);
  expect(typeof badge.a11yLabel).toBe('string');
  expect(badge.a11yLabel.length).toBeGreaterThan(0);
  expect(badge.icon.length).toBeGreaterThan(0);
  expect(['primary', 'neutral', 'success', 'warning', 'danger']).toContain(badge.tone);
  expect(['soft', 'solid', 'outline']).toContain(badge.variant);
}

// ─────────────────────────────────────────────────────────────────────────────
// automationBadge(status) — status → presentation metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('automationBadge', () => {
  it('maps "automation-enabled" to primary metadata with the shared label', () => {
    const badge = automationBadge('automation-enabled');
    expect(badge).toMatchObject({
      status: 'automation-enabled',
      label: AUTOMATION_ENABLED_LABEL,
      tone: 'primary',
      variant: 'soft',
      icon: 'flash',
    });
    expectValidBadge(badge);
  });

  it('maps "automation-active" to primary metadata with the shared label', () => {
    const badge = automationBadge('automation-active');
    expect(badge).toMatchObject({
      status: 'automation-active',
      label: AUTOMATION_ACTIVE_LABEL,
      tone: 'primary',
      variant: 'soft',
      icon: 'flash',
    });
    expectValidBadge(badge);
  });

  it('maps "no-smart-home-actions" to a neutral outline badge', () => {
    const badge = automationBadge('no-smart-home-actions');
    expect(badge).toMatchObject({
      status: 'no-smart-home-actions',
      label: NO_SMART_HOME_ACTIONS_LABEL,
      tone: 'neutral',
      variant: 'outline',
      icon: 'flash-off',
    });
    expectValidBadge(badge);
  });

  it('maps "no-active-schedules" to a neutral outline badge', () => {
    const badge = automationBadge('no-active-schedules');
    expect(badge).toMatchObject({
      status: 'no-active-schedules',
      label: NO_ACTIVE_SCHEDULES_LABEL,
      tone: 'neutral',
      variant: 'outline',
      icon: 'alarm',
    });
    expectValidBadge(badge);
  });

  it('provides future-ready presets (matter, offline, execution-failed, sync-pending)', () => {
    expect(automationBadge('matter')).toMatchObject({ tone: 'primary', icon: 'hardware-chip' });
    expect(automationBadge('offline')).toMatchObject({ tone: 'neutral', icon: 'cloud-offline' });
    expect(automationBadge('execution-failed')).toMatchObject({ tone: 'danger', icon: 'alert-circle' });
    expect(automationBadge('sync-pending')).toMatchObject({ tone: 'warning', icon: 'sync' });
    expectValidBadge(automationBadge('matter'));
    expectValidBadge(automationBadge('offline'));
    expectValidBadge(automationBadge('execution-failed'));
    expectValidBadge(automationBadge('sync-pending'));
  });

  it('falls back to a safe "unknown" badge for unrecognized values', () => {
    const badge = automationBadge('totally-made-up');
    expect(badge.status).toBe('unknown');
    expect(badge.tone).toBe('neutral');
    expect(badge.icon).toBe('help-circle');
    expectValidBadge(badge);
  });

  it('does not throw on null / undefined (backward compatibility)', () => {
    expect(automationBadge(null).status).toBe('unknown');
    expect(automationBadge(undefined).status).toBe('unknown');
  });

  it('returns immutable presets that cannot be mutated', () => {
    const badge = automationBadge('automation-enabled');
    expect(Object.isFrozen(badge)).toBe(true);
    expect(() => {
      (badge as { label: string }).label = 'Hacked';
    }).toThrow();
    expect(automationBadge('automation-enabled').label).toBe(AUTOMATION_ENABLED_LABEL);
  });

  it('contains presentation metadata only (no domain fields)', () => {
    const badge = automationBadge('automation-enabled');
    expect(Object.keys(badge).sort()).toEqual(
      ['a11yLabel', 'icon', 'label', 'status', 'tone', 'variant'].sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scheduleAutomationBadge(hasActions)
// ─────────────────────────────────────────────────────────────────────────────

describe('scheduleAutomationBadge', () => {
  it('returns the "Automation Enabled" badge when the vibe has device actions', () => {
    const badge = scheduleAutomationBadge(true);
    expect(badge?.status).toBe('automation-enabled');
    expect(badge?.label).toBe(AUTOMATION_ENABLED_LABEL);
  });

  it('returns null for a list context when there are no device actions', () => {
    expect(scheduleAutomationBadge(false)).toBeNull();
  });

  it('returns the "No Smart Home Actions" badge for a detail context (includeEmpty)', () => {
    const badge = scheduleAutomationBadge(false, { includeEmpty: true });
    expect(badge?.status).toBe('no-smart-home-actions');
    expect(badge?.label).toBe(NO_SMART_HOME_ACTIONS_LABEL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// vibeAutomationBadge(hasActive)
// ─────────────────────────────────────────────────────────────────────────────

describe('vibeAutomationBadge', () => {
  it('returns the "Automation Active" badge when the vibe has an active schedule', () => {
    const badge = vibeAutomationBadge(true);
    expect(badge?.status).toBe('automation-active');
    expect(badge?.label).toBe(AUTOMATION_ACTIVE_LABEL);
  });

  it('returns null for a list context when there is no active schedule', () => {
    expect(vibeAutomationBadge(false)).toBeNull();
  });

  it('returns the "No active schedules" badge for a detail context (includeEmpty)', () => {
    const badge = vibeAutomationBadge(false, { includeEmpty: true });
    expect(badge?.status).toBe('no-active-schedules');
    expect(badge?.label).toBe(NO_ACTIVE_SCHEDULES_LABEL);
  });
});
