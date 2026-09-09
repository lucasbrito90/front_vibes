import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * google-home.service.ts
 *
 * The ONLY module in this app authorized to import/call the native `GoogleHome`
 * Capacitor plugin (front_vibes/android/app/src/main/java/app/ixora/googlehome/
 * GoogleHomePlugin.kt) directly. UI code (pages/composables) must go through
 * the functions exported here.
 *
 * ADR-036: Google Home is a device-side, Android-only provider by deliberate
 * architectural decision — there is no `web:` implementation to fall back to.
 * `isGoogleHomeSupported()` is the single platform gate every other function
 * here passes through before touching the native plugin.
 *
 * Stateless by design: this module never persists the Google device id
 * anywhere. It flows in memory only, from `listDevices()` through
 * `mapToIxoraDevice()` to whatever calls `syncReportedDevices()`
 * (provider-connection.service.ts), and disappears once the caller's state
 * is gone (e.g. the discovery screen closes).
 */

export type GoogleHomePermissionStatus = 'SUCCESS' | 'CANCELLED' | 'ERROR';

/** Mirrors GoogleHomePlugin.kt's requestGoogleHomePermissions() resolve shape. */
export interface GoogleHomePermissionResult {
  status: GoogleHomePermissionStatus;
  errorMessage?: string;
}

/** Raw device shape returned by GoogleHomePlugin.kt's listDevices() — SDK flags, not ADR-033. */
export interface RawGoogleHomeDevice {
  id: string;
  name: string;
  hasOnOffLight: boolean;
  hasOnOffPlug: boolean;
  hasDimmableLight: boolean;
}

/** ADR-033 capability map shape — mirrors HomeAssistantAdapter::deriveCapabilities() output. */
export interface GoogleHomeDeviceCapabilities {
  can_turn_on?: Record<string, never>;
  can_turn_off?: Record<string, never>;
  can_toggle?: Record<string, never>;
  can_set_brightness?: { min: number; max: number; step: number };
}

/** Ixora device type vocabulary (back_vibes App\SmartHome\DeviceType) this mapping can infer. */
export type IxoraDeviceType = 'lighting' | 'switchable' | null;

/** Shape expected by POST /api/provider-connections/{id}/devices/sync, minus the raw plugin id. */
export interface IxoraMappedDevice {
  provider_device_id: string;
  name: string;
  type: IxoraDeviceType;
  capabilities: GoogleHomeDeviceCapabilities;
}

interface GoogleHomeNativePlugin {
  requestGoogleHomePermissions(): Promise<GoogleHomePermissionResult>;
  listDevices(): Promise<{ devices: RawGoogleHomeDevice[] }>;
}

// No `web:` implementation — Android-only by ADR-036 decision, not a gap to
// fill in. Every call site goes through isGoogleHomeSupported() first.
const GoogleHomeNative = registerPlugin<GoogleHomeNativePlugin>('GoogleHome');

const UNSUPPORTED_PLATFORM_MESSAGE = 'Google Home discovery requires the Android app.';

/**
 * The platform gate (backgroundAudio.service.ts precedent, line ~60): true
 * only on native Android. No provider/platform matrix exists in the backend
 * or elsewhere in the frontend — this is the single source of truth for
 * "can this environment run the native Google Home plugin".
 */
function isGoogleHomeSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Requests Google Home permissions via the native plugin. Never calls the
 * plugin when the platform gate fails — returns an ERROR result instead.
 */
async function requestPermissions(): Promise<GoogleHomePermissionResult> {
  if (!isGoogleHomeSupported()) {
    return { status: 'ERROR', errorMessage: UNSUPPORTED_PLATFORM_MESSAGE };
  }

  return GoogleHomeNative.requestGoogleHomePermissions();
}

/**
 * Lists Google Home devices via the native plugin. Never calls the plugin
 * when the platform gate fails — throws instead, mirroring the offline/error
 * handling shape of other service functions in this app.
 */
async function listDevices(): Promise<RawGoogleHomeDevice[]> {
  if (!isGoogleHomeSupported()) {
    throw new Error(UNSUPPORTED_PLATFORM_MESSAGE);
  }

  const result = await GoogleHomeNative.listDevices();
  return result.devices;
}

/**
 * Pure mapping from the Google Home SDK's raw device-type flags to the
 * ADR-033 capability vocabulary + Ixora device type — mirrors
 * back_vibes/app/SmartHome/Adapters/HomeAssistantAdapter.php::deriveCapabilities().
 * No Capacitor import, no side effects — directly testable with plain objects.
 */
function mapToIxoraDevice(raw: RawGoogleHomeDevice): IxoraMappedDevice {
  const capabilities: GoogleHomeDeviceCapabilities = {};

  if (raw.hasOnOffLight || raw.hasOnOffPlug || raw.hasDimmableLight) {
    capabilities.can_turn_on = {};
    capabilities.can_turn_off = {};
    capabilities.can_toggle = {};
  }

  if (raw.hasDimmableLight) {
    capabilities.can_set_brightness = { min: 0, max: 255, step: 1 };
  }

  let type: IxoraDeviceType = null;
  if (raw.hasOnOffLight || raw.hasDimmableLight) {
    type = 'lighting';
  } else if (raw.hasOnOffPlug) {
    type = 'switchable';
  }

  return {
    provider_device_id: raw.id,
    name: raw.name,
    type,
    capabilities,
  };
}

export const googleHomeService = {
  isGoogleHomeSupported,
  requestPermissions,
  listDevices,
  mapToIxoraDevice,
};
