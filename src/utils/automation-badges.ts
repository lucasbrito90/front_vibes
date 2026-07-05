/**
 * Automation badge presentation helper
 * (Scheduler + Smart Home Automations · Phase 5C.1 — Mobile Polish).
 *
 * Centralizes ALL automation badge presentation metadata in one place so every
 * screen renders badges consistently.
 *
 * This module is deliberately domain-agnostic. It knows NOTHING about the
 * Scheduler, Smart Home, API, HTTP, or persistence — it only maps a presentation
 * "status" token into visual metadata. Callers decide the status (typically from
 * the booleans in `automation-summary.ts`) and pass it here purely for display.
 *
 * Text / summary string formatting stays in `automation-summary.ts`.
 */

import {
  AUTOMATION_ACTIVE_LABEL,
  AUTOMATION_ENABLED_LABEL,
  NO_ACTIVE_SCHEDULES_LABEL,
  NO_SMART_HOME_ACTIONS_LABEL,
} from '@/utils/automation-summary';

/** Visual color intent — resolved to design-system tokens by the badge component. */
export type AutomationBadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger';

/** Visual fill style. */
export type AutomationBadgeVariant = 'soft' | 'solid' | 'outline';

/** Semantic icon key — the badge component resolves it to an ionicon glyph. */
export type AutomationBadgeIcon =
  | 'flash'
  | 'flash-off'
  | 'alarm'
  | 'hardware-chip'
  | 'cloud-offline'
  | 'alert-circle'
  | 'sync'
  | 'help-circle';

/** Presentation status tokens (current + future-ready). */
export type AutomationBadgeStatus =
  | 'automation-enabled'
  | 'automation-active'
  | 'no-smart-home-actions'
  | 'no-active-schedules'
  // Future-ready — not rendered by the current screens, but centralized here so
  // later phases reuse the same presentation contract.
  | 'matter'
  | 'offline'
  | 'execution-failed'
  | 'sync-pending'
  | 'unknown';

/** UI metadata for a single badge. Pure presentation — no domain data. */
export interface AutomationBadge {
  status: AutomationBadgeStatus;
  label: string;
  tone: AutomationBadgeTone;
  variant: AutomationBadgeVariant;
  icon: AutomationBadgeIcon;
  /** Explicit, self-describing label for assistive technology (never color-only). */
  a11yLabel: string;
}

function freeze(badge: AutomationBadge): AutomationBadge {
  return Object.freeze(badge);
}

const BADGE_PRESETS: Readonly<Record<Exclude<AutomationBadgeStatus, 'unknown'>, AutomationBadge>> =
  Object.freeze({
    'automation-enabled': freeze({
      status: 'automation-enabled',
      label: AUTOMATION_ENABLED_LABEL,
      tone: 'primary',
      variant: 'soft',
      icon: 'flash',
      a11yLabel: 'Smart home automation enabled',
    }),
    'automation-active': freeze({
      status: 'automation-active',
      label: AUTOMATION_ACTIVE_LABEL,
      tone: 'primary',
      variant: 'soft',
      icon: 'flash',
      a11yLabel: 'Smart home automation active',
    }),
    'no-smart-home-actions': freeze({
      status: 'no-smart-home-actions',
      label: NO_SMART_HOME_ACTIONS_LABEL,
      tone: 'neutral',
      variant: 'outline',
      icon: 'flash-off',
      a11yLabel: 'No smart home actions',
    }),
    'no-active-schedules': freeze({
      status: 'no-active-schedules',
      label: NO_ACTIVE_SCHEDULES_LABEL,
      tone: 'neutral',
      variant: 'outline',
      icon: 'alarm',
      a11yLabel: 'No active schedules',
    }),
    matter: freeze({
      status: 'matter',
      label: 'Matter',
      tone: 'primary',
      variant: 'soft',
      icon: 'hardware-chip',
      a11yLabel: 'Matter device',
    }),
    offline: freeze({
      status: 'offline',
      label: 'Offline',
      tone: 'neutral',
      variant: 'soft',
      icon: 'cloud-offline',
      a11yLabel: 'Offline',
    }),
    'execution-failed': freeze({
      status: 'execution-failed',
      label: 'Execution Failed',
      tone: 'danger',
      variant: 'soft',
      icon: 'alert-circle',
      a11yLabel: 'Automation execution failed',
    }),
    'sync-pending': freeze({
      status: 'sync-pending',
      label: 'Sync Pending',
      tone: 'warning',
      variant: 'soft',
      icon: 'sync',
      a11yLabel: 'Sync pending',
    }),
  });

const UNKNOWN_BADGE: AutomationBadge = freeze({
  status: 'unknown',
  label: 'Unknown',
  tone: 'neutral',
  variant: 'outline',
  icon: 'help-circle',
  a11yLabel: 'Unknown status',
});

/**
 * Resolve badge metadata for a status token. Unrecognized / missing values
 * fall back to a safe neutral "unknown" badge (never throws).
 */
export function automationBadge(
  status: AutomationBadgeStatus | string | null | undefined,
): AutomationBadge {
  if (typeof status === 'string' && status in BADGE_PRESETS) {
    return BADGE_PRESETS[status as keyof typeof BADGE_PRESETS];
  }
  return UNKNOWN_BADGE;
}

/**
 * Badge for a schedule row/detail based on whether its vibe has device actions.
 * Takes a plain boolean (domain decision made by the caller) to stay presentation-only.
 *
 * @param hasActions Whether the linked vibe has any Smart Home device action.
 * @param options.includeEmpty When true, returns the "No Smart Home Actions"
 *   badge instead of `null` (use for detail screens; lists pass `false`).
 */
export function scheduleAutomationBadge(
  hasActions: boolean,
  options: { includeEmpty?: boolean } = {},
): AutomationBadge | null {
  if (hasActions) {
    return automationBadge('automation-enabled');
  }
  return options.includeEmpty ? automationBadge('no-smart-home-actions') : null;
}

/**
 * Badge for a vibe row/detail based on whether it has an active schedule.
 * Takes a plain boolean (domain decision made by the caller) to stay presentation-only.
 *
 * @param hasActive Whether the vibe has at least one enabled schedule.
 * @param options.includeEmpty When true, returns the "No active schedules"
 *   badge instead of `null` (use for detail screens; lists pass `false`).
 */
export function vibeAutomationBadge(
  hasActive: boolean,
  options: { includeEmpty?: boolean } = {},
): AutomationBadge | null {
  if (hasActive) {
    return automationBadge('automation-active');
  }
  return options.includeEmpty ? automationBadge('no-active-schedules') : null;
}
