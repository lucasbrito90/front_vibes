import type { DeviceStatus } from '@/services/device.service';
import type { ConnectionStatus } from '@/services/provider-connection.service';

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

/** Human-friendly provider label. MVP: Home Assistant only. */
export function providerLabel(provider: string): string {
  switch (provider) {
    case 'home_assistant':
      return 'Home Assistant';
    default:
      return provider;
  }
}
