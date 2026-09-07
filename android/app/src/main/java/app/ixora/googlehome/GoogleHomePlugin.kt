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
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import com.google.home.matter.standard.StandardDeviceTypeRegistry
import com.google.home.matter.standard.StandardTraitRegistry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first

/**
 * GH02 spike — Google Home Android integration (v1.6.0, ADR-036).
 *
 * Real Home API usage below is grounded in the SDK's own javadoc (extracted
 * from the downloaded play-services-home / play-services-home-types
 * artifacts — see docs/specs/smart-home/google-home/access-gate.md finding
 * B for why they aren't on Maven), not invented. Two examples straight from
 * HasDeviceTypes' own doc comment:
 *   if (device.has(DimmableLightDevice)) { device.type(DimmableLightDevice).first().onOff.on }
 *   device.type(DimmableLightDevice).collect { it.onOff.on }
 *
 * Scope per the GH02 card: requestGoogleHomePermissions() -> listDevices()
 * -> readDeviceState()/executeAction(on/off), tried first against devices
 * already linked to the user's Google Home (Surplife/Tuya cloud-to-cloud —
 * no hub required), per ADR-036 Decision 11 no Android-specific concept
 * leaks past this file. Matter and iOS are out of scope.
 *
 * Spike only. Not the production shape: no ProviderAdapter involvement
 * (Google Home does not implement that contract — ADR-036 Decision 3),
 * nothing wired to Scenes/Vibes/Scheduler, and per GH03b's open retention
 * question this does not persist any Google identifier anywhere — every
 * lookup below re-queries the SDK's in-memory flow.
 */
@CapacitorPlugin(name = "GoogleHome")
class GoogleHomePlugin : Plugin() {

    companion object {
        private const val TAG = "GoogleHomePlugin"

        /** Home SDK requires Android 10+ (API 29) — access-gate.md §4. */
        private const val MIN_SUPPORTED_SDK_INT = Build.VERSION_CODES.Q
    }

    private val pluginScope = CoroutineScope(Dispatchers.IO)
    private var homeClient: HomeClient? = null

    override fun load() {
        super.load()

        if (Build.VERSION.SDK_INT < MIN_SUPPORTED_SDK_INT) {
            return
        }

        // FactoryRegistry MUST list every trait/device type the app depends on
        // (HomeConfig.getFactoryRegistry javadoc) — combining the Matter
        // "standard" registry with the "google" registry (cloud-to-cloud /
        // GHP-specific traits) to cover the Surplife/Tuya cloud-to-cloud case
        // this spike targets, not just Matter hardware.
        val factoryRegistry = FactoryRegistry(
            StandardTraitRegistry.traits + GoogleTraitRegistry.traits,
            StandardDeviceTypeRegistry.types + GoogleDeviceTypeRegistry.types,
        )

        val homeConfig = HomeConfig(
            /* strictOperationValidation = */ false,
            /* coroutineContext = */ Dispatchers.IO,
            /* factoryRegistry = */ factoryRegistry,
            /* serverClientId = */ null, // ADR-036 Decision 8: no server-side credential, no offline access requested.
            /* homePlatformScope = */ HomeConfig.HomePlatformScope.HOME_PLATFORM_SCOPE_VERSION_1,
        )

        homeClient = Home.getClient(context, homeConfig)

        // Must run before the bridge Activity finishes onCreate() — load() runs
        // inside BridgeActivity.onCreate() (via super.onCreate() -> bridge init),
        // which satisfies this without forking BridgeActivity. This was GH02's
        // first stop condition; confirmed working in the earlier scaffold commit.
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

                when {
                    device.has(OnOffLightDevice) -> {
                        val type = device.type(OnOffLightDevice).first()
                        // OnOffTrait.Attributes.getOnOff(): Boolean — the Matter cluster's
                        // "OnOff" attribute, distinct from the on()/off() commands below.
                        payload.put("onOff", type.standardTraits.onOff?.onOff ?: JSObject.NULL)
                    }
                    device.has(OnOffPluginUnitDevice) -> {
                        val type = device.type(OnOffPluginUnitDevice).first()
                        payload.put("onOff", type.standardTraits.onOff?.onOff ?: JSObject.NULL)
                    }
                    else -> payload.put("onOff", JSObject.NULL)
                }

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
        val action = call.getString("action") // "on" | "off"

        if (deviceId.isNullOrBlank() || (action != "on" && action != "off")) {
            call.reject("deviceId and action ('on'|'off') are required")
            return
        }

        pluginScope.launch {
            try {
                val device = client.devices(false).get(Id.of(deviceId))
                if (device == null) {
                    call.reject("Device not found: $deviceId")
                    return@launch
                }

                val onOff = when {
                    device.has(OnOffLightDevice) ->
                        device.type(OnOffLightDevice).first().standardTraits.onOff
                    device.has(OnOffPluginUnitDevice) ->
                        device.type(OnOffPluginUnitDevice).first().standardTraits.onOff
                    else -> null
                }

                if (onOff == null) {
                    call.reject("Device does not support on/off: $deviceId")
                    return@launch
                }

                if (action == "on") onOff.on() else onOff.off()

                val payload = JSObject()
                payload.put("ok", true)
                call.resolve(payload)
            } catch (e: Exception) {
                call.reject("executeAction failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun ping(call: PluginCall) {
        // Bridge round-trip smoke test — proven in the earlier scaffold commit.
        val result = JSObject()
        result.put("ok", true)
        result.put("sdkInt", Build.VERSION.SDK_INT)
        result.put("platformSupported", Build.VERSION.SDK_INT >= MIN_SUPPORTED_SDK_INT)
        result.put("clientInitialized", homeClient != null)
        call.resolve(result)
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
