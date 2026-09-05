import { describe, expect, it } from 'vitest';
import type { ProviderType } from '@/services/provider-connection.service';
import {
  connectionStatusBadge,
  deviceStatusBadge,
  deviceTypeInfo,
  providerLabel,
} from '@/utils/device-status';

const mockProviderTypes: ProviderType[] = [
  {
    slug: 'home_assistant',
    label: 'Home Assistant',
    config: { base_url: { type: 'string', required: true, format: 'url:https' } },
    credentials: { access_token: { type: 'string', required: true } },
  },
  {
    slug: 'tuya',
    label: 'Tuya',
    config: {},
    credentials: { api_key: { type: 'string', required: true } },
  },
];

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

  it('providerLabel: returns label from providerTypes when slug is known', () => {
    expect(providerLabel('home_assistant', mockProviderTypes)).toBe('Home Assistant');
    expect(providerLabel('tuya', mockProviderTypes)).toBe('Tuya');
  });

  it('providerLabel: falls back to raw slug when slug is not in providerTypes', () => {
    expect(providerLabel('unknown_vendor', mockProviderTypes)).toBe('unknown_vendor');
  });

  it('providerLabel: falls back to raw slug when providerTypes is empty', () => {
    expect(providerLabel('home_assistant', [])).toBe('home_assistant');
  });

  it('providerLabel: falls back to raw slug when providerTypes is undefined', () => {
    expect(providerLabel('home_assistant')).toBe('home_assistant');
    expect(providerLabel('custom')).toBe('custom');
  });
});

describe('device-status — deviceTypeInfo', () => {
  it('maps all five T15 device types to distinct icons and labels', () => {
    const lighting = deviceTypeInfo('lighting');
    const switchable = deviceTypeInfo('switchable');
    const media = deviceTypeInfo('media');
    const ventilation = deviceTypeInfo('ventilation');
    const other = deviceTypeInfo('other');

    expect(lighting.label).toBe('Lighting');
    expect(switchable.label).toBe('Switch');
    expect(media.label).toBe('Media');
    expect(ventilation.label).toBe('Ventilation');
    expect(other.label).toBe('other'); // raw slug for 'other' (generic)

    // All icons must be non-empty strings (actual ionicon path data)
    for (const info of [lighting, switchable, media, ventilation, other]) {
      expect(typeof info.icon).toBe('string');
      expect(info.icon.length).toBeGreaterThan(0);
    }

    // Distinct icons for the four meaningful types
    const icons = [lighting.icon, switchable.icon, media.icon, ventilation.icon];
    expect(new Set(icons).size).toBe(4);
  });

  it('falls back gracefully for null type', () => {
    const info = deviceTypeInfo(null);
    expect(info.label).toBe('Device');
    expect(info.icon.length).toBeGreaterThan(0);
  });

  it('falls back gracefully for undefined type', () => {
    const info = deviceTypeInfo(undefined);
    expect(info.label).toBe('Device');
  });

  it('falls back gracefully for an unrecognised slug', () => {
    const info = deviceTypeInfo('robot_vacuum');
    expect(info.label).toBe('robot_vacuum'); // raw slug preserved
    expect(info.icon.length).toBeGreaterThan(0);
  });
});
