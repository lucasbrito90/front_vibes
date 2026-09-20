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

/**
 * The capability payload this service produces.
 *
 * Two shapes at once, deliberately (CSDM-04, ADR-037 §8) — the same
 * expand/contract the Home Assistant mapper uses on the backend:
 *
 * - The **canonical** half (`contract_version` + `capabilities`) is the
 *   authoritative one, and what CSDM-06 will read.
 * - The **legacy** `can_*` keys are still emitted because `utils/device-action.ts`
 *   builds the action editor from them and the backend's
 *   `ActionType::isBlockedByDeviceCapabilities` reads them too. Dropping them
 *   now would leave every imported Google device offering no actions at all.
 *
 * CSDM-07 removes the legacy half.
 */
export interface GoogleHomeDeviceCapabilities {
  // Canonical half (ADR-037 §2-§5).
  contract_version?: string;
  capabilities?: Record<string, CanonicalCapability>;

  // Legacy half (ADR-033), transitional.
  can_turn_on?: Record<string, never>;
  can_turn_off?: Record<string, never>;
  can_toggle?: Record<string, never>;
  can_set_brightness?: { min: number; max: number; step: number };
}

/** One canonical capability, mirroring the shared schema in ixora-infra/contracts. */
export interface CanonicalCapability {
  id: string;
  access: 'read' | 'write' | 'read_write';
  operations: string[];
  constraints:
    | { type: 'number'; min: number | null; max: number | null; step: number | null; unit: string }
    | { type: 'enum'; allowed_values: string[] }
    | { type: 'boolean' }
    | null;
}

/**
 * Semver of the canonical contract this service emits. Must match
 * `contracts/smart-home/capability.v1.schema.json`; the backend rejects an
 * envelope whose major version it does not understand.
 */
export const CANONICAL_CONTRACT_VERSION = '1.0.0';

/**
 * Canonical brightness range, fixed by ADR-037 §5 — NOT Matter's 0-254 and not
 * Home Assistant's 0-255. Both are protocol artifacts; the native plugin
 * converts Matter's scale at its own boundary (CanonicalBrightness.kt), and
 * nothing on this side of the bridge needs to know it exists.
 */
const CANONICAL_BRIGHTNESS = { min: 0, max: 100, step: 1, unit: 'percent' } as const;

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

    capabilities.can_turn_on = {};
    capabilities.can_turn_off = {};
    capabilities.can_toggle = {};
  }

  if (raw.hasDimmableLight) {
    canonical.brightness = {
      id: 'brightness',
      access: 'read_write',
      operations: ['set'],
      constraints: { type: 'number', ...CANONICAL_BRIGHTNESS },
    };

    // The legacy half still declares the scale the pre-ADR-037 pipeline used,
    // because the backend range-checks legacy-shaped parameters against it
    // (CSDM-02) while the transition window is open.
    capabilities.can_set_brightness = { min: 0, max: 255, step: 1 };
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
  mapToIxoraDevice,
};
