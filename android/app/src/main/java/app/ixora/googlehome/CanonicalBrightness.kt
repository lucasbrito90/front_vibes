package app.ixora.googlehome

/**
 * Brightness conversion between Matter's native LevelControl range and the
 * Ixora canonical domain value (ADR-037 §5, CSDM-04).
 *
 * The canonical brightness is a **percentage, 0–100**. Neither Matter's 0–254
 * nor Home Assistant's 0–255 has any claim to being the domain value — both are
 * protocol artifacts of their ecosystems, and privileging either would repeat
 * the mistake ADR-037 exists to correct. The percentage is also what any UI
 * eventually needs to render a slider, so the display layer needs no conversion
 * of its own.
 *
 * This object is where Matter's scale is allowed to exist on the Google side,
 * and where it stops: everything leaving the plugin toward JS is canonical.
 *
 * Zero dependency on the Google Home SDK — pure integer math — so it stays
 * covered by JUnit without the SDK artifacts, exactly like the P09 object it
 * supersedes.
 */
object CanonicalBrightness {

    /** Matter LevelControl valid range upper bound (255 is reserved in the protocol). */
    const val MATTER_MAX = 254

    /** The canonical range, fixed by ADR-037 §5. */
    const val CANONICAL_MIN = 0
    const val CANONICAL_MAX = 100

    /**
     * Matter native level (0–254) → canonical percent (0–100).
     *
     * @throws IllegalArgumentException if [matterLevel] is outside 0..254
     */
    fun matterToPercent(matterLevel: Int): Int {
        require(matterLevel in 0..MATTER_MAX) {
            "matterLevel must be in 0..$MATTER_MAX, got $matterLevel"
        }
        if (matterLevel == 0) return CANONICAL_MIN
        if (matterLevel == MATTER_MAX) return CANONICAL_MAX
        // Round-half-up integer scaling, so a value never drifts downward.
        return (matterLevel * CANONICAL_MAX + MATTER_MAX / 2) / MATTER_MAX
    }

    /**
     * Canonical percent (0–100) → Matter native level (0–254).
     *
     * 100% maps to 254, never 255: 255 is reserved in the Matter protocol, and
     * emitting it would be sending a value the spec does not define.
     *
     * @throws IllegalArgumentException if [percent] is outside 0..100
     */
    fun percentToMatter(percent: Int): Int {
        require(percent in CANONICAL_MIN..CANONICAL_MAX) {
            "percent must be in $CANONICAL_MIN..$CANONICAL_MAX, got $percent"
        }
        if (percent == CANONICAL_MIN) return 0
        if (percent == CANONICAL_MAX) return MATTER_MAX
        return (percent * MATTER_MAX + CANONICAL_MAX / 2) / CANONICAL_MAX
    }
}
