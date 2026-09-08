package app.ixora.googlehome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Unit tests for [BrightnessNormalization] — the only part of P09 that can
 * be verified without the Google Home SDK or physical hardware.
 */
class BrightnessNormalizationTest {

    // ── matterToIxora ──────────────────────────────────────────────────────

    @Test
    fun matterToIxora_zero_mapsToZero() {
        assertEquals(0, BrightnessNormalization.matterToIxora(0))
    }

    @Test
    fun matterToIxora_maxMatter_mapsTo255() {
        assertEquals(255, BrightnessNormalization.matterToIxora(254))
    }

    @Test
    fun matterToIxora_midpoint_scalesLinearly() {
        // (127 * 255 + 127) / 254 = 128
        assertEquals(128, BrightnessNormalization.matterToIxora(127))
    }

    @Test
    fun matterToIxora_quarterPoint() {
        assertEquals(64, BrightnessNormalization.matterToIxora(64))
    }

    @Test
    fun matterToIxora_threeQuarterPoint() {
        // (191 * 255 + 127) / 254 = 192
        assertEquals(192, BrightnessNormalization.matterToIxora(191))
    }

    @Test
    fun matterToIxora_rejectsNegative() {
        assertThrows(IllegalArgumentException::class.java) {
            BrightnessNormalization.matterToIxora(-1)
        }
    }

    @Test
    fun matterToIxora_rejects255_reservedMatterValue() {
        assertThrows(IllegalArgumentException::class.java) {
            BrightnessNormalization.matterToIxora(255)
        }
    }

    // ── ixoraToMatter ──────────────────────────────────────────────────────

    @Test
    fun ixoraToMatter_zero_mapsToZero() {
        assertEquals(0, BrightnessNormalization.ixoraToMatter(0))
    }

    @Test
    fun ixoraToMatter_255_mapsTo254_notInvalid255() {
        assertEquals(254, BrightnessNormalization.ixoraToMatter(255))
    }

    @Test
    fun ixoraToMatter_254_mapsTo253() {
        assertEquals(253, BrightnessNormalization.ixoraToMatter(254))
    }

    @Test
    fun ixoraToMatter_midpoint() {
        assertEquals(127, BrightnessNormalization.ixoraToMatter(128))
    }

    @Test
    fun ixoraToMatter_rejectsNegative() {
        assertThrows(IllegalArgumentException::class.java) {
            BrightnessNormalization.ixoraToMatter(-1)
        }
    }

    @Test
    fun ixoraToMatter_rejectsAbove255() {
        assertThrows(IllegalArgumentException::class.java) {
            BrightnessNormalization.ixoraToMatter(256)
        }
    }

    // ── Round-trip consistency ─────────────────────────────────────────────

    @Test
    fun roundTrip_matterEndpoints_areStable() {
        assertEquals(0, BrightnessNormalization.ixoraToMatter(
            BrightnessNormalization.matterToIxora(0),
        ))
        assertEquals(254, BrightnessNormalization.ixoraToMatter(
            BrightnessNormalization.matterToIxora(254),
        ))
    }

    @Test
    fun roundTrip_ixora255_alwaysBecomesMatter254() {
        val matter = BrightnessNormalization.ixoraToMatter(255)
        assertEquals(254, matter)
        assertEquals(255, BrightnessNormalization.matterToIxora(matter))
    }
}
