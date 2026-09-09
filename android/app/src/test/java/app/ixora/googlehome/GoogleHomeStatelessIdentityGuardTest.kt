package app.ixora.googlehome

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * P11 structural guard — the Google Home native module (this package) must
 * never persist an identifier supplied by the Google Home SDK on the
 * device. See docs/android-native-customizations.md Section 11 for the
 * full rationale (GH03c: relocating a retained Google-derived identifier
 * from backend to on-device storage does not change the retention
 * obligation, so on-device persistence would only add a second retention
 * surface with no compliance benefit).
 *
 * Scans every .kt source file in this package for references to on-device
 * persistence APIs and fails if one is introduced — a structural boundary
 * guard, not a business-logic test, mirroring the pattern already used
 * server-side by back_vibes' ProviderExtensibilityBoundaryTest.
 */
class GoogleHomeStatelessIdentityGuardTest {

    companion object {
        /**
         * Gradle unit tests run with the `app` module directory as the JVM
         * working directory (confirmed empirically: `System.getProperty
         * ("user.dir")` under `./gradlew testDebugUnitTest`) — a stable,
         * Gradle-convention-derived path, not tied to any implementation
         * detail of this plugin.
         */
        private fun googleHomePackageDir(): File =
            File(System.getProperty("user.dir"), "src/main/java/app/ixora/googlehome")

        /**
         * Each pair is (substring to detect, human-readable label for the
         * failure message). Matches anywhere in file content — not just
         * import lines — so a fully-qualified reference without an import
         * is caught too.
         */
        private val forbiddenPersistenceApis = listOf(
            "SharedPreferences" to "SharedPreferences",
            "androidx.security.crypto" to "androidx.security.crypto (EncryptedSharedPreferences/MasterKey)",
            "DataStore" to "Jetpack DataStore",
            "SQLiteOpenHelper" to "SQLiteOpenHelper",
            "androidx.room" to "the Room persistence library",
            "@Entity" to "a Room @Entity",
            "@Database" to "a Room @Database",
            "openFileOutput" to "Context.openFileOutput",
            "getFilesDir" to "Context.getFilesDir",
            "getCacheDir" to "Context.getCacheDir",
            "getExternalFilesDir" to "Context.getExternalFilesDir",
            "ContentResolver" to "ContentResolver",
            "WorkManager" to "WorkManager",
        )
    }

    @Test
    fun `google home package directory exists`() {
        val dir = googleHomePackageDir()
        assertTrue("Expected the Google Home native module directory to exist at $dir", dir.isDirectory)
    }

    @Test
    fun `google home native module never references an on-device persistence API`() {
        val dir = googleHomePackageDir()
        val kotlinFiles = dir.listFiles { file -> file.extension == "kt" }.orEmpty().toList()

        assertTrue("Expected at least one .kt file in $dir", kotlinFiles.isNotEmpty())

        for (file in kotlinFiles) {
            val contents = file.readText()

            for ((pattern, label) in forbiddenPersistenceApis) {
                assertTrue(
                    "${file.name} must not reference $label. The Google Home native module is " +
                        "stateless by design (P11) — Google Home device identifiers must never be " +
                        "persisted on Android. See docs/android-native-customizations.md Section 11.",
                    !contents.contains(pattern),
                )
            }
        }
    }
}
