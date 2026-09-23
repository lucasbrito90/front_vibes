import { Capacitor, registerPlugin } from '@capacitor/core';

import {
  CANONICAL_BRIGHTNESS_RANGE,
  CANONICAL_CONTRACT_VERSION,
} from '@/utils/canonical-contract';
import type { CanonicalCapability } from '@/utils/canonical-capabilities';

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

/**
 * Canonical capability envelope reported to the backend (ADR-037 §2-§5).
 *
 * CSDM-07b emits only this shape — no legacy `can_*` keys and no provider
 * scales. Devices synced earlier remain readable via `parseCapabilities()`.
 */
export interface GoogleHomeDeviceCapabilities {
  contract_version?: string;
  capabilities?: Record<string, CanonicalCapability>;
}

export { CANONICAL_CONTRACT_VERSION };

/** Ixora device type vocabulary (back_vibes App\SmartHome\DeviceType) this mapping can infer. */
export type IxoraDeviceType = 'lighting' | 'switchable' | null;

/** Shape expected by POST /api/provider-connections/{id}/devices/sync, minus the raw plugin id. */
export interface IxoraMappedDevice {
  provider_device_id: string;
  name: string;
  type: IxoraDeviceType;
  capabilities: GoogleHomeDeviceCapabilities;
}

/**
 * Actions GoogleHomePlugin.kt's `executeAction()` accepts — mirrors its
 * `SUPPORTED_ACTIONS` set verbatim (Kotlin is the source of truth; this is
 * not a separate vocabulary to keep in sync by convention).
 */
export type GoogleHomeExecuteAction = 'on' | 'off' | 'toggle' | 'set_brightness';

/** Plugin resolve shape for executeAction() — mirrors the Kotlin `{ ok: true }` payload. */
export interface GoogleHomeExecuteResult {
  ok: boolean;
}

/**
 * Plugin resolve shape for readDeviceState() (P06/P09). `brightnessPercent`
 * is the canonical field (ADR-037 §5); `brightness` is the transitional
 * 0-255 field the plugin also emits — never read by this app (CSDM-04/07).
 */
export interface RawGoogleHomeDeviceState {
  id: string;
  name: string;
  onOff: boolean | null;
  brightnessPercent: number | null;
  brightness: number | null;
}

interface GoogleHomeNativePlugin {
  requestGoogleHomePermissions(): Promise<GoogleHomePermissionResult>;
  listDevices(): Promise<{ devices: RawGoogleHomeDevice[] }>;
  readDeviceState(options: { deviceId: string }): Promise<RawGoogleHomeDeviceState>;
  executeAction(options: {
    deviceId: string;
    action: GoogleHomeExecuteAction;
    /** Canonical percentage (0-100, ADR-037 §5) — required only for 'set_brightness'. */
    value?: number;
  }): Promise<GoogleHomeExecuteResult>;
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
 * Reads current state for one Google Home device via the native plugin.
 * Never calls the plugin when the platform gate fails — throws instead,
 * mirroring listDevices().
 */
async function readDeviceState(deviceId: string): Promise<RawGoogleHomeDeviceState> {
  if (!isGoogleHomeSupported()) {
    throw new Error(UNSUPPORTED_PLATFORM_MESSAGE);
  }

  return GoogleHomeNative.readDeviceState({ deviceId });
}

/**
 * Executes one action (on/off/toggle/set_brightness) against a Google Home
 * device via the native plugin (P09/ADR-036 Decision 7). `value` is the
 * canonical percentage (ADR-037 §5) — this service never sends a
 * provider-native scale. Never calls the plugin when the platform gate
 * fails — throws instead, mirroring listDevices()/readDeviceState().
 */
async function executeAction(
  deviceId: string,
  action: GoogleHomeExecuteAction,
  value?: number,
): Promise<GoogleHomeExecuteResult> {
  if (!isGoogleHomeSupported()) {
    throw new Error(UNSUPPORTED_PLATFORM_MESSAGE);
  }

  return GoogleHomeNative.executeAction({ deviceId, action, value });
}

/**
 * Pure mapping from the Google Home SDK's raw device-type flags to the
 * ADR-033 capability vocabulary + Ixora device type — mirrors
 * back_vibes/app/SmartHome/Adapters/HomeAssistantAdapter.php::deriveCapabilities().
 * No Capacitor import, no side effects — directly testable with plain objects.
 */
function mapToIxoraDevice(raw: RawGoogleHomeDevice): IxoraMappedDevice {
  const canonical: Record<string, CanonicalCapability> = {};
  const capabilities: GoogleHomeDeviceCapabilities = {};

  if (raw.hasOnOffLight || raw.hasOnOffPlug || raw.hasDimmableLight) {
    // `toggle` is a canonical operation regardless of how a provider performs
    // it. Google's SDK exposes a native OnOffCommands.toggle() — verified
    // against the real AAR bytecode during P09 review, correcting GH04's
    // earlier claim that it did not exist — so the plugin calls it directly
    // rather than composing read-invert-write. Either way the domain sees one
    // operation, which is the whole point of the canonical model.
    canonical.power = {
      id: 'power',
      access: 'read_write',
      operations: ['on', 'off', 'toggle'],
      constraints: { type: 'boolean' },
    };

  }

  if (raw.hasDimmableLight) {
    canonical.brightness = {
      id: 'brightness',
      access: 'read_write',
      operations: ['set'],
      constraints: { type: 'number', ...CANONICAL_BRIGHTNESS_RANGE },
    };
  }

  if (Object.keys(canonical).length > 0) {
    capabilities.contract_version = CANONICAL_CONTRACT_VERSION;
    capabilities.capabilities = canonical;
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
  readDeviceState,
  executeAction,
  mapToIxoraDevice,
};
