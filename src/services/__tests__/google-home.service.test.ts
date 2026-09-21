import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mirrors laravel-http.test.ts's pattern for mocking '@capacitor/core' — the
// service under test is the ONLY module allowed to call registerPlugin()
// directly, so tests here mock the plugin object it registers, never a
// consumer mocking the raw plugin (that pattern is reserved for
// useGoogleHomeDiscovery.test.ts, which mocks this whole service instead).

const {
  mockIsNativePlatform,
  mockGetPlatform,
  mockRequestPermissions,
  mockListDevices,
  mockReadDeviceState,
  mockExecuteAction,
} = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn((): boolean => true),
  mockGetPlatform: vi.fn((): string => 'android'),
  mockRequestPermissions: vi.fn(),
  mockListDevices: vi.fn(),
  mockReadDeviceState: vi.fn(),
  mockExecuteAction: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: mockGetPlatform,
  },
  registerPlugin: vi.fn(() => ({
    requestGoogleHomePermissions: mockRequestPermissions,
    listDevices: mockListDevices,
    readDeviceState: mockReadDeviceState,
    executeAction: mockExecuteAction,
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
  mockReadDeviceState.mockReset();
  mockExecuteAction.mockReset();
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

// ── readDeviceState ───────────────────────────────────────────────────────────

describe('readDeviceState', () => {
  it('calls the native plugin with the deviceId and returns its result when supported', async () => {
    mockReadDeviceState.mockResolvedValue({
      id: 'device@1',
      name: 'Living Room Light',
      onOff: true,
      brightnessPercent: 50,
      brightness: 127,
    });

    const result = await googleHomeService.readDeviceState('device@1');

    expect(mockReadDeviceState).toHaveBeenCalledWith({ deviceId: 'device@1' });
    expect(result.onOff).toBe(true);
    expect(result.brightnessPercent).toBe(50);
  });

  it('throws without calling the plugin when unsupported', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    await expect(googleHomeService.readDeviceState('device@1')).rejects.toThrow();
    expect(mockReadDeviceState).not.toHaveBeenCalled();
  });
});

// ── executeAction ─────────────────────────────────────────────────────────────

describe('executeAction', () => {
  it('calls the native plugin with deviceId/action and returns its result when supported', async () => {
    mockExecuteAction.mockResolvedValue({ ok: true });

    const result = await googleHomeService.executeAction('device@1', 'on');

    expect(mockExecuteAction).toHaveBeenCalledWith({
      deviceId: 'device@1',
      action: 'on',
      value: undefined,
    });
    expect(result).toEqual({ ok: true });
  });

  it('forwards the canonical percent value for set_brightness, never a provider scale', async () => {
    mockExecuteAction.mockResolvedValue({ ok: true });

    await googleHomeService.executeAction('device@1', 'set_brightness', 75);

    expect(mockExecuteAction).toHaveBeenCalledWith({
      deviceId: 'device@1',
      action: 'set_brightness',
      value: 75,
    });
  });

  it('throws without calling the plugin when unsupported', async () => {
    mockIsNativePlatform.mockReturnValue(false);

    await expect(googleHomeService.executeAction('device@1', 'toggle')).rejects.toThrow();
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('propagates a plugin rejection rather than swallowing it', async () => {
    mockExecuteAction.mockRejectedValue(new Error('Device not found: device@1'));

    await expect(googleHomeService.executeAction('device@1', 'off')).rejects.toThrow(
      'Device not found: device@1',
    );
  });
});

// ── mapToIxoraDevice — pure function, no mocks needed for its own logic ─────

describe('mapToIxoraDevice', () => {
  it('maps a light-only device to lighting + can_turn_on/off/toggle, no brightness', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'light-1', name: 'Kitchen Light', hasOnOffLight: true }),
    );

    expect(mapped).toMatchObject({
      provider_device_id: 'light-1',
      name: 'Kitchen Light',
      type: 'lighting',
      capabilities: { can_turn_on: {}, can_turn_off: {}, can_toggle: {} },
    });

    // Still no brightness — the assertion the exact-shape check was making.
    expect(mapped.capabilities.can_set_brightness).toBeUndefined();
  });

  it('maps a dimmable-light-only device to lighting + brightness capability', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'dim-1', name: 'Bedroom Light', hasDimmableLight: true }),
    );

    expect(mapped).toMatchObject({
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

    expect(mapped).toMatchObject({
      provider_device_id: 'plug-1',
      name: 'Fan Plug',
      type: 'switchable',
      capabilities: { can_turn_on: {}, can_turn_off: {}, can_toggle: {} },
    });

    expect(mapped.capabilities.can_set_brightness).toBeUndefined();
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

// ── CSDM-04 — the canonical half (ADR-037 §2-§5) ────────────────────────────

describe('mapToIxoraDevice — canonical capabilities', () => {
  it('emits the canonical envelope alongside the legacy keys', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'dim-2', name: 'Hall Light', hasDimmableLight: true }),
    );

    // Canonical half — authoritative, and what CSDM-06 will read.
    expect(mapped.capabilities.contract_version).toBe('1.0.0');
    expect(Object.keys(mapped.capabilities.capabilities ?? {})).toEqual(['power', 'brightness']);

    // Legacy half — still there, because the action editor and the backend
    // capability gate both read it until CSDM-06/CSDM-07 move them.
    expect(mapped.capabilities.can_turn_on).toBeDefined();
  });

  it('declares brightness in the canonical range, never a provider scale', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'dim-3', name: 'Desk Light', hasDimmableLight: true }),
    );

    expect(mapped.capabilities.capabilities?.brightness).toEqual({
      id: 'brightness',
      access: 'read_write',
      operations: ['set'],
      // Neither Matter's 0-254 nor Home Assistant's 0-255: both are protocol
      // artifacts, converted at the plugin boundary (CanonicalBrightness.kt).
      constraints: { type: 'number', min: 0, max: 100, step: 1, unit: 'percent' },
    });
  });

  it('declares power as a boolean capability carrying all three operations', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'plug-2', name: 'Lamp Plug', hasOnOffPlug: true }),
    );

    expect(mapped.capabilities.capabilities?.power).toEqual({
      id: 'power',
      access: 'read_write',
      // toggle is canonical regardless of how the provider performs it — the
      // Google SDK has a native toggle(), verified against the real AAR during
      // P09 review; Home Assistant has one too. The domain sees one operation.
      operations: ['on', 'off', 'toggle'],
      constraints: { type: 'boolean' },
    });
  });

  it('emits no envelope at all for a device with no known capability', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'unknown-2', name: 'Mystery' }),
    );

    // Fail-open (ADR-033 §5): an empty payload means unknown, not unsupported.
    expect(mapped.capabilities.contract_version).toBeUndefined();
    expect(mapped.capabilities.capabilities).toBeUndefined();
  });

  it('never lets a Matter level or trait name reach the canonical half', () => {
    const mapped = googleHomeService.mapToIxoraDevice(
      rawDevice({ id: 'dim-4', name: 'Leak Check', hasDimmableLight: true }),
    );

    const canonical = JSON.stringify(mapped.capabilities.capabilities);

    expect(canonical).not.toContain('254');
    expect(canonical).not.toContain('255');
    expect(canonical.toLowerCase()).not.toContain('levelcontrol');
    expect(canonical.toLowerCase()).not.toContain('onofftrait');
  });
});
