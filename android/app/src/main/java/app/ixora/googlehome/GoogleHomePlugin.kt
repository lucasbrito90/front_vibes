package app.ixora.googlehome

import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * GH02 spike — Google Home Android integration (v1.6.0, ADR-036).
 *
 * Scope per docs/specs/smart-home/google-home/access-gate.md: prove
 * requestPermissions() -> listDevices() -> readDeviceState()/executeAction()
 * against a real device the user's Google account already exposes via
 * Google Home (cloud-to-cloud, e.g. Surplife/Tuya — no hub required).
 *
 * The Home APIs Android SDK (play-services-home) ships outside the standard
 * Maven distribution (GH03a finding B) and is not yet linked into this
 * module. Until it is, every method below fails closed with a clear,
 * distinguishable error so the Capacitor bridge itself — Kotlin compiling
 * into the APK, plugin registration, JS <-> native round trip — can be
 * verified independently of the SDK artifact.
 *
 * Spike only. Not the production shape: no persistence, no ProviderAdapter
 * involvement (Google Home does not implement that contract — ADR-036
 * Decision 3), nothing here is wired to Scenes/Vibes/Scheduler.
 */
@CapacitorPlugin(name = "GoogleHome")
class GoogleHomePlugin : Plugin() {

    companion object {
        private const val TAG = "GoogleHomePlugin"

        /** Home SDK requires Android 10+ (API 29) — see access-gate.md §4. */
        private const val MIN_SUPPORTED_SDK_INT = Build.VERSION_CODES.Q
    }

    override fun load() {
        super.load()
        // NOTE: Home.getClient() / registerActivityResultCallerForPermissions()
        // wiring goes here once the SDK artifact is linked (GH03a finding B).
        // load() runs during bridge init, inside BridgeActivity.onCreate(),
        // which satisfies the SDK's "before onCreate completes" consent
        // registration requirement without forking BridgeActivity.
    }

    @PluginMethod
    fun requestGoogleHomePermissions(call: PluginCall) {
        if (!isPlatformSupported(call)) return
        call.reject("Google Home SDK not yet linked into this build (GH02 scaffold stage).")
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        if (!isPlatformSupported(call)) return
        call.reject("Google Home SDK not yet linked into this build (GH02 scaffold stage).")
    }

    @PluginMethod
    fun readDeviceState(call: PluginCall) {
        if (!isPlatformSupported(call)) return
        call.reject("Google Home SDK not yet linked into this build (GH02 scaffold stage).")
    }

    @PluginMethod
    fun ping(call: PluginCall) {
        // Bridge round-trip smoke test — no SDK dependency. If this resolves,
        // Kotlin -> Capacitor -> JS is proven end to end on the device.
        val result = JSObject()
        result.put("ok", true)
        result.put("sdkInt", Build.VERSION.SDK_INT)
        result.put("platformSupported", Build.VERSION.SDK_INT >= MIN_SUPPORTED_SDK_INT)
        call.resolve(result)
    }

    private fun isPlatformSupported(call: PluginCall): Boolean {
        if (Build.VERSION.SDK_INT < MIN_SUPPORTED_SDK_INT) {
            call.reject("Google Home APIs require Android 10 (API 29) or later.")
            return false
        }
        return true
    }
}
