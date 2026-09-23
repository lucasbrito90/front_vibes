package app.ixora.googlehome

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * CSDM-07b — canonical Matter 0–254 ↔ percent conversion is defined only in
 * [CanonicalBrightness]. [BrightnessNormalization] remains for the transitional
 * P09 0–255 read path in [GoogleHomePlugin] and must not gain new callers.
 */
class CanonicalScaleBoundaryTest {

    @Test
    fun canonicalConversionFunctionsExistOnlyInCanonicalBrightness() {
        val packageDir = File("src/main/java/app/ixora/googlehome")
        require(packageDir.isDirectory) { "Expected googlehome sources at ${packageDir.path}" }

        val allowedDefiner = "CanonicalBrightness.kt"

        packageDir.listFiles { file -> file.extension == "kt" }?.forEach { file ->
            val code = stripComments(file.readText())
            val definesMatterToPercent = Regex("""fun\s+matterToPercent\s*\(""").containsMatchIn(code)
            val definesPercentToMatter = Regex("""fun\s+percentToMatter\s*\(""").containsMatchIn(code)

            if (file.name == allowedDefiner) {
                assertTrue("CanonicalBrightness must define matterToPercent", definesMatterToPercent)
                assertTrue("CanonicalBrightness must define percentToMatter", definesPercentToMatter)
            } else {
                assertFalse(
                    "${file.name} must not define matterToPercent — use CanonicalBrightness",
                    definesMatterToPercent,
                )
                assertFalse(
                    "${file.name} must not define percentToMatter — use CanonicalBrightness",
                    definesPercentToMatter,
                )
            }
        }
    }

    @Test
    fun brightnessNormalizationIsStillPresentForTransitionalPluginPath() {
        // Documented: not dead — GoogleHomePlugin.kt still accepts legacy 0-255 input.
        val plugin = File("src/main/java/app/ixora/googlehome/GoogleHomePlugin.kt")
        val normalization = File("src/main/java/app/ixora/googlehome/BrightnessNormalization.kt")

        assertTrue(plugin.exists())
        assertTrue(normalization.exists())
        assertTrue(
            stripComments(plugin.readText()).contains("BrightnessNormalization"),
        )
    }

    private fun stripComments(source: String): String {
        return source
            .replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
            .replace(Regex("(?m)^\\s*//.*$"), "")
    }
}
