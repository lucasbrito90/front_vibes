import {
  appsOutline,
  bulbOutline,
  leafOutline,
  powerOutline,
  tvOutline,
} from 'ionicons/icons';
import type { DeviceStatus } from '@/services/device.service';
import type { ConnectionStatus, ProviderType } from '@/services/provider-connection.service';

export interface StatusBadge {
  label: string;
  /** Ionic color token used for the badge. */
  color: 'success' | 'danger' | 'medium' | 'warning';
}

/**
 * Map a device status to its badge presentation.
 * - online  → green (success)
 * - offline → red (danger)
 * - unknown → neutral/grey (medium)
 */
export function deviceStatusBadge(status: DeviceStatus | string): StatusBadge {
  switch (status) {
    case 'online':
      return { label: 'Online', color: 'success' };
    case 'offline':
      return { label: 'Offline', color: 'danger' };
    case 'unknown':
    default:
      return { label: 'Unknown', color: 'medium' };
  }
}

/**
 * Map a provider connection status to its badge presentation.
 * - connected   → green (success)
 * - unreachable → red (danger)
 * - unknown     → neutral/grey (medium)
 */
export function connectionStatusBadge(status: ConnectionStatus | string): StatusBadge {
  switch (status) {
    case 'connected':
      return { label: 'Connected', color: 'success' };
    case 'unreachable':
      return { label: 'Unreachable', color: 'danger' };
    case 'unknown':
    default:
      return { label: 'Unknown', color: 'medium' };
  }
}

/**
 * Human-friendly provider label.
 * Looks up the provider slug in the provided list of ProviderType objects
 * (from GET /api/provider-types). Falls back to the raw slug when the list
 * is absent or the slug is not found.
 */
export function providerLabel(provider: string, providerTypes?: ProviderType[]): string {
  return providerTypes?.find((p) => p.slug === provider)?.label ?? provider;
}

export interface DeviceTypeInfo {
  /** Ionicons icon string. */
  icon: string;
  /** Human-readable label (Title Case). */
  label: string;
}

/**
 * Map a device type slug (T15 vocabulary: lighting / switchable / media /
 * ventilation / other) to an icon + label pair. Falls back gracefully for
 * null / undefined / unrecognised slugs so the UI never shows a blank.
 *
 * Icon choices:
 * - lighting    → bulbOutline      (light bulb, universally understood)
 * - switchable  → powerOutline     (power/switch button)
 * - media       → tvOutline        (screen/media device)
 * - ventilation → leafOutline      (eco/airflow — ionicons has no fan icon)
 * - other       → appsOutline      (generic grid / catch-all)
 * - null/unknown → appsOutline     (same safe fallback)
 */
export function deviceTypeInfo(type: string | null | undefined): DeviceTypeInfo {
  switch (type) {
    case 'lighting':
      return { icon: bulbOutline, label: 'Lighting' };
    case 'switchable':
      return { icon: powerOutline, label: 'Switch' };
    case 'media':
      return { icon: tvOutline, label: 'Media' };
    case 'ventilation':
      return { icon: leafOutline, label: 'Ventilation' };
    case 'other':
    default:
      return { icon: appsOutline, label: type ? String(type) : 'Device' };
  }
}
