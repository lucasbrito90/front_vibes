import { describe, expect, it } from 'vitest';
import {
  connectionStatusBadge,
  deviceStatusBadge,
  providerLabel,
} from '@/utils/device-status';

describe('device-status — badge mapping', () => {
  it('maps online → green (success)', () => {
    expect(deviceStatusBadge('online')).toEqual({ label: 'Online', color: 'success' });
  });

  it('maps offline → red (danger)', () => {
    expect(deviceStatusBadge('offline')).toEqual({ label: 'Offline', color: 'danger' });
  });

  it('maps unknown → neutral (medium)', () => {
    expect(deviceStatusBadge('unknown')).toEqual({ label: 'Unknown', color: 'medium' });
  });

  it('falls back to neutral for unexpected device status', () => {
    expect(deviceStatusBadge('weird').color).toBe('medium');
  });

  it('maps connection statuses', () => {
    expect(connectionStatusBadge('connected').color).toBe('success');
    expect(connectionStatusBadge('unreachable').color).toBe('danger');
    expect(connectionStatusBadge('unknown').color).toBe('medium');
  });

  it('humanises provider slugs', () => {
    expect(providerLabel('home_assistant')).toBe('Home Assistant');
    expect(providerLabel('custom')).toBe('custom');
  });
});
