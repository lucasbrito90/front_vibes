package app.ixora.googlehome

import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.home.FactoryRegistry
import com.google.home.ForcePermissionFlow
import com.google.home.Home
import com.google.home.HomeClient
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.Id
import com.google.home.PermissionsResultStatus
import com.google.home.google.GoogleDeviceTypeRegistry
import com.google.home.google.GoogleTraitRegistry
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.LevelControl
import com.google.home.matter.standard.LevelControlTrait
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import com.google.home.matter.standard.StandardDeviceTypeRegistry
import com.google.home.matter.standard.StandardTraitRegistry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Production Capacitor plugin for Google Home device-side integration
 * (v1.6.0, ADR-036).
 *
 * Ported from the GH02 spike (feature/gh02-google-home-android-spike,
 * commit 3ae9f1b) with additions for can_set_brightness (LevelControl +
 * 0–254→0–255 normalization) and can_toggle (read/invert composition —
 * OnOffTrait has no native toggle() command).
 *
 * This plugin discovers devices, reads state, and executes actions locally
 * via the Google Home Android SDK. Results are returned to the JS layer;
 * persistence and backend reporting are handled by higher layers (P11/P12).
 *
 * Physical verification against real hardware is pending manual QA — only
 * on/off was physically confirmed in GH02; brightness is SDK-spec grounded
 * but not yet hardware-verified.
 */
@CapacitorPlugin(name = "GoogleHome")
class GoogleHomePlugin : Plugin() {

    companion object {
        /** Home SDK requires Android 10+ (API 29). */
        private const val MIN_SUPPORTED_SDK_INT = Build.VERSION_CODES.Q

        private val SUPPORTED_ACTIONS = setOf("on", "off", "toggle", "set_brightness")
    }

    private val pluginScope = CoroutineScope(Dispatchers.IO)
    private var homeClient: HomeClient? = null

    override fun load() {
        super.load()

        if (Build.VERSION.SDK_INT < MIN_SUPPORTED_SDK_INT) {
            return
        }

        // FactoryRegistry MUST list every trait/device type the app depends on.
        // Combining Matter "standard" + Google "cloud-to-cloud" registries
        // covers Surplife/Tuya devices linked via Google Home (GH02 verified).
        val factoryRegistry = FactoryRegistry(
            StandardTraitRegistry.traits + GoogleTraitRegistry.traits,
            StandardDeviceTypeRegistry.types + GoogleDeviceTypeRegistry.types,
        )

        val homeConfig = HomeConfig(
            /* strictOperationValidation = */ false,
            /* coroutineContext = */ Dispatchers.IO,
            /* factoryRegistry = */ factoryRegistry,
            /* serverClientId = */ null,
            /* homePlatformScope = */ HomeConfig.HomePlatformScope.HOME_PLATFORM_SCOPE_VERSION_1,
        )

        homeClient = Home.getClient(context, homeConfig)

        // Must run before BridgeActivity finishes onCreate() — load() runs
        // inside BridgeActivity.onCreate() via super.onCreate() → bridge init.
        (activity as? androidx.activity.result.ActivityResultCaller)?.let {
            homeClient?.registerActivityResultCallerForPermissions(it)
        }
    }

    @PluginMethod
    fun requestGoogleHomePermissions(call: PluginCall) {
        val client = requireClient(call) ?: return

        pluginScope.launch {
            try {
                val result = client.requestPermissions(ForcePermissionFlow.FORCE_LAUNCH, null)
                val payload = JSObject()
                payload.put(
                    "status",
                    when (result.status) {
                        PermissionsResultStatus.SUCCESS -> "SUCCESS"
                        PermissionsResultStatus.CANCELLED -> "CANCELLED"
                        PermissionsResultStatus.ERROR -> "ERROR"
                    },
                )
                if (result.errorMessage != null) {
                    payload.put("errorMessage", result.errorMessage)
                }
                call.resolve(payload)
            } catch (e: Exception) {
                call.reject("requestGoogleHomePermissions failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        val client = requireClient(call) ?: return

        pluginScope.launch {
            try {
                val devices = client.devices(false).list()
                val result = JSArray()

                for (device in devices) {
                    val entry = JSObject()
                    entry.put("id", device.id.id)
                    entry.put("name", device.name)
                    entry.put("hasOnOffLight", device.has(OnOffLightDevice))
                    entry.put("hasOnOffPlug", device.has(OnOffPluginUnitDevice))
                    entry.put("hasDimmableLight", device.has(DimmableLightDevice))
                    result.put(entry)
                }

                val payload = JSObject()
                payload.put("devices", result)
                call.resolve(payload)
            } catch (e: Exception) {
                call.reject("listDevices failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun readDeviceState(call: PluginCall) {
        val client = requireClient(call) ?: return
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrBlank()) {
            call.reject("deviceId is required")
            return
        }

        pluginScope.launch {
            try {
                val device = client.devices(false).get(Id.of(deviceId))
                if (device == null) {
                    call.reject("Device not found: $deviceId")
                    return@launch
                }

                val payload = JSObject()
                payload.put("id", device.id.id)
                payload.put("name", device.name)
                putOnOffState(payload, device)
                putBrightnessState(payload, device)

                call.resolve(payload)
            } catch (e: Exception) {
                call.reject("readDeviceState failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun executeAction(call: PluginCall) {
        val client = requireClient(call) ?: return
        val deviceId = call.getString("deviceId")
        val action = call.getString("action")

        if (deviceId.isNullOrBlank() || action.isNullOrBlank() || action !in SUPPORTED_ACTIONS) {
            call.reject("deviceId and action ('on'|'off'|'toggle'|'set_brightness') are required")
            return
        }

        pluginScope.launch {
            try {
                val device = client.devices(false).get(Id.of(deviceId))
                if (device == null) {
                    call.reject("Device not found: $deviceId")
                    return@launch
                }

                when (action) {
                    "on", "off" -> executeOnOff(device, action == "on", call)
                    "toggle" -> executeToggle(device, call)
                    "set_brightness" -> executeSetBrightness(call, device)
                }
            } catch (e: Exception) {
                call.reject("executeAction failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun ping(call: PluginCall) {
        val result = JSObject()
        result.put("ok", true)
        result.put("sdkInt", Build.VERSION.SDK_INT)
        result.put("platformSupported", Build.VERSION.SDK_INT >= MIN_SUPPORTED_SDK_INT)
        result.put("clientInitialized", homeClient != null)
        call.resolve(result)
    }

    // ── Action executors ───────────────────────────────────────────────────

    private suspend fun executeOnOff(device: HomeDevice, turnOn: Boolean, call: PluginCall) {
        val onOff = resolveOnOffTrait(device)
        if (onOff == null) {
            call.reject("Device does not support on/off: ${device.id.id}")
            return
        }

        if (turnOn) onOff.on() else onOff.off()

        val payload = JSObject()
        payload.put("ok", true)
        call.resolve(payload)
    }

    /**
     * can_toggle — no native toggle() on OnOffTrait (GH04 confirmed).
     * Read current onOff attribute, invert, call on() or off().
     */
    private suspend fun executeToggle(device: HomeDevice, call: PluginCall) {
        val onOff = resolveOnOffTrait(device)
        if (onOff == null) {
            call.reject("Device does not support toggle: ${device.id.id}")
            return
        }

        val currentOn = onOff.onOff
        if (currentOn == null) {
            call.reject("Unable to read current on/off state for toggle: ${device.id.id}")
            return
        }

        if (currentOn) onOff.off() else onOff.on()

        val payload = JSObject()
        payload.put("ok", true)
        call.resolve(payload)
    }

    /**
     * can_set_brightness via DimmableLightDevice.standardTraits.levelControl.
     * Accepts domain brightness 0–255; converts to Matter 0–254 before
     * calling moveToLevel(). levelControl may be null at runtime even on
     * DimmableLightDevice — checked explicitly, never assumed.
     */
    private suspend fun executeSetBrightness(call: PluginCall, device: HomeDevice) {
        val brightness = call.getInt("brightness")
        if (brightness == null || brightness !in 0..BrightnessNormalization.IXORA_MAX) {
            call.reject("brightness (0-255) is required for set_brightness")
            return
        }

        val levelControl = resolveLevelControl(device)
        if (levelControl == null) {
            call.reject("Device does not support brightness: ${device.id.id}")
            return
        }

        val matterLevel = BrightnessNormalization.ixoraToMatter(brightness)
        val defaultOptions = LevelControlTrait.OptionsBitmap()
        levelControl.moveToLevel(
            matterLevel.toUByte(),
            null,
            defaultOptions,
            defaultOptions,
        )

        val payload = JSObject()
        payload.put("ok", true)
        call.resolve(payload)
    }

    // ── State readers ────────────────────────────────────────────────────

    private suspend fun putOnOffState(payload: JSObject, device: HomeDevice) {
        val onOff = resolveOnOffTrait(device)
        payload.put("onOff", onOff?.onOff ?: JSObject.NULL)
    }

    private suspend fun putBrightnessState(payload: JSObject, device: HomeDevice) {
        val levelControl = resolveLevelControl(device)
        if (levelControl == null) {
            payload.put("brightness", JSObject.NULL)
            return
        }

        val currentLevel = levelControl.currentLevel
        payload.put(
            "brightness",
            if (currentLevel != null) {
                BrightnessNormalization.matterToIxora(currentLevel.toInt())
            } else {
                JSObject.NULL
            },
        )
    }

    // ── Trait resolvers ────────────────────────────────────────────────────

    private suspend fun resolveOnOffTrait(device: HomeDevice): OnOff? {
        return when {
            device.has(OnOffLightDevice) ->
                device.type(OnOffLightDevice).first().standardTraits.onOff
            device.has(OnOffPluginUnitDevice) ->
                device.type(OnOffPluginUnitDevice).first().standardTraits.onOff
            device.has(DimmableLightDevice) ->
                device.type(DimmableLightDevice).first().standardTraits.onOff
            else -> null
        }
    }

    /**
     * Returns levelControl only when present at runtime — never assumed from
     * device type alone (GH04 / Matter spec: nullable even on DimmableLightDevice).
     */
    private suspend fun resolveLevelControl(device: HomeDevice): LevelControl? {
        if (!device.has(DimmableLightDevice)) {
            return null
        }
        return device.type(DimmableLightDevice).first().standardTraits.levelControl
    }

    private fun requireClient(call: PluginCall): HomeClient? {
        if (Build.VERSION.SDK_INT < MIN_SUPPORTED_SDK_INT) {
            call.reject("Google Home APIs require Android 10 (API 29) or later.")
            return null
        }
        val client = homeClient
        if (client == null) {
            call.reject("Google Home client not initialized.")
            return null
        }
        return client
    }
}
