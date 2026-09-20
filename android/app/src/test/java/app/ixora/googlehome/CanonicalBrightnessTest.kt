package app.ixora.googlehome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * CSDM-04 — canonical brightness on the Google side (ADR-037 §5, §12).
 *
 * The boundary these tests defend: Matter's 0–254 may exist inside
 * CanonicalBrightness and nowhere else. What leaves is a percentage.
 */
class CanonicalBrightnessTest {

    @Test
    fun `matter bounds map to canonical bounds exactly`() {
        assertEquals(0, CanonicalBrightness.matterToPercent(0))
        assertEquals(100, CanonicalBrightness.matterToPercent(254))
        assertEquals(0, CanonicalBrightness.percentToMatter(0))
        assertEquals(254, CanonicalBrightness.percentToMatter(100))
    }

    @Test
    fun `full brightness never emits the reserved matter level`() {
        // 255 is reserved/undefined in the Matter protocol. Emitting it would
        // be sending a value the spec does not define.
        assertEquals(254, CanonicalBrightness.percentToMatter(100))
    }

    @Test
    fun `the ADR worked example holds`() {
        // ADR-037 §12: brightness.set(65) reaches Google as moveToLevel(165).
        assertEquals(165, CanonicalBrightness.percentToMatter(65))
    }

    @Test
    fun `every canonical percent survives a round trip`() {
        // 254/100 is not an integer, so the round trip is not bit-exact by
        // construction. What must hold is that it never drifts: a value the
        // user chose comes back as the value the user chose.
        for (percent in 0..100) {
            val roundTripped = CanonicalBrightness.matterToPercent(
                CanonicalBrightness.percentToMatter(percent),
            )
            assertEquals("percent $percent drifted on the round trip", percent, roundTripped)
        }
    }

    @Test
    fun `conversion never produces a value outside either range`() {
        for (matter in 0..254) {
            val percent = CanonicalBrightness.matterToPercent(matter)
            assert(percent in 0..100) { "matter $matter produced out-of-range percent $percent" }
        }

        for (percent in 0..100) {
            val matter = CanonicalBrightness.percentToMatter(percent)
            assert(matter in 0..254) { "percent $percent produced out-of-range matter $matter" }
        }
    }

    @Test
    fun `out-of-range input is rejected rather than clamped`() {
        // Clamping would silently accept a command the domain already refused
        // (CSDM-02), hiding a defect instead of surfacing it.
        assertThrows(IllegalArgumentException::class.java) {
            CanonicalBrightness.percentToMatter(101)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CanonicalBrightness.percentToMatter(-1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CanonicalBrightness.matterToPercent(255)
        }
    }
}
