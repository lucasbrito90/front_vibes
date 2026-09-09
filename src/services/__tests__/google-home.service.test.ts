import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mirrors laravel-http.test.ts's pattern for mocking '@capacitor/core' — the
// service under test is the ONLY module allowed to call registerPlugin()
// directly, so tests here mock the plugin object it registers, never a
// consumer mocking the raw plugin (that pattern is reserved for
// useGoogleHomeDiscovery.test.ts, which mocks this whole service instead).

const { mockIsNativePlatform, mockGetPlatform, mockRequestPermissions, mockListDevices } =
  vi.hoisted(() => ({
    mockIsNativePlatform: vi.fn((): boolean => true),
    mockGetPlatform: vi.fn((): string => 'android'),
    mockRequestPermissions: vi.fn(),
    mockListDevices: vi.fn(),
  }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: mockGetPlatform,
  },
  registerPlugin: vi.fn(() => ({
    requestGoogleHomePermissions: mockRequestPermissions,
    listDevices: mockListDevices,
  })),
}));

import {
  googleHomeService,
  type RawGoogleHomeDevice,
} from '@/services/google-home.service';

function rawDevice(overrides: Partial<RawGoogleHomeDevice> = {}): RawGoogleHomeDevice {
  return {
    id: 'device@1',
    name: 'Living Room Light',
    hasOnOffLight: false,
    hasOnOffPlug: false,
    hasDimmableLight: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockIsNativePlatform.mockReturnValue(true);
  mockGetPlatform.mockReturnValue('android');
  mockRequestPermissions.mockReset();
  mockListDevices.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── isGoogleHomeSupported ────────────────────────────────────────────────────

describe('isGoogleHomeSupported', () => {
  it('is true on native Android', () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue('android');
    expect(googleHomeService.isGoogleHomeSupported()).toBe(true);
  });

  it('is false on web (not native)', () => {
    mockIsNativePlatform.mockReturnValue(false);
    mockGetPlatform.mockReturnValue('android');
    expect(googleHomeService.isGoogleHomeSupported()).toBe(false);
  });

  it('is false on native iOS', () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue('ios');
    expect(googleHomeService.isGoogleHomeSupported()).toBe(false);
  });
});

// ── requestPermissions ───────────────────────────────────────────────────────

describe('requestPermissions', () => {
  it('calls the native plugin and returns its result when supported', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'SUCCESS' });

    const result = await googleHomeService.requestPermissions();

    expect(mockRequestPermissions).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'SUCCESS' });
  });

  it('returns ERROR without calling the plugin when unsupported', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    const result = await googleHomeService.requestPermissions();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(result.status).toBe('ERROR');
    expect(result.errorMessage).toBeTruthy();
  });
});

// ── listDevices ───────────────────────────────────────────────────────────────

describe('listDevices', () => {
  it('calls the native plugin and returns its devices array when supported', async () => {
    const devices = [rawDevice()];
    mockListDevices.mockResolvedValue({ devices });

    const result = await googleHomeService.listDevices();

    expect(mockListDevices).toHaveBeenCalledOnce();
    expect(result).toEqual(devices);
  });

  it('throws without calling the plugin when unsupported', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    await expect(googleHomeService.listDevices()).rejects.toThrow();
    expect(mockListDevices).not.toHaveBeenCalled();
  });
});

// ── mapToIxoraDevice — pure function, no mocks needed for its own logic ─────

describe('mapToIxoraDevice', () => {
  it('maps a light-only device to lighting + can_turn_on/off/toggle, no brightness', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'light-1', name: 'Kitchen Light', hasOnOffLight: true }),
    );

    expect(mapped).toEqual({
      provider_device_id: 'light-1',
      name: 'Kitchen Light',
      type: 'lighting',
      capabilities: { can_turn_on: {}, can_turn_off: {}, can_toggle: {} },
    });
  });

  it('maps a dimmable-light-only device to lighting + brightness capability', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'dim-1', name: 'Bedroom Light', hasDimmableLight: true }),
    );

    expect(mapped).toEqual({
      provider_device_id: 'dim-1',
      name: 'Bedroom Light',
      type: 'lighting',
      capabilities: {
        can_turn_on: {},
        can_turn_off: {},
        can_toggle: {},
        can_set_brightness: { min: 0, max: 255, step: 1 },
      },
    });
  });

  it('maps a plug-only device to switchable, no brightness', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'plug-1', name: 'Fan Plug', hasOnOffPlug: true }),
    );

    expect(mapped).toEqual({
      provider_device_id: 'plug-1',
      name: 'Fan Plug',
      type: 'switchable',
      capabilities: { can_turn_on: {}, can_turn_off: {}, can_toggle: {} },
    });
  });

  it('maps a device with no known flags to null type and no capabilities', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'unknown-1', name: 'Mystery Device' }),
    );

    expect(mapped).toEqual({
      provider_device_id: 'unknown-1',
      name: 'Mystery Device',
      type: null,
      capabilities: {},
    });
  });

  it('never returns the raw id in a renderable field other than provider_device_id', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'device@raw-id-123', hasOnOffLight: true }),
    );

    expect(mapped.provider_device_id).toBe('device@raw-id-123');
    expect(JSON.stringify(mapped.name)).not.toContain('raw-id-123');
  });
});
