package app.ixora.googlehome

/**
 * Pure brightness scale conversion between the Matter LevelControl native
 * range (0–254; 255 is reserved/undefined in the protocol) and the Ixora
 * domain range (0–255, ADR-033 / Home Assistant convention).
 *
 * This object has zero dependency on the Google Home SDK — only integer
 * math — so it can be covered by JUnit unit tests without the SDK artifacts.
 */
object BrightnessNormalization {

    /** Matter LevelControl valid range upper bound (255 is reserved). */
    const val MATTER_MAX = 254

    /** Ixora / ADR-033 brightness range upper bound. */
    const val IXORA_MAX = 255

    /**
     * Convert a Matter native level (0–254) to the Ixora domain (0–255).
     *
     * @throws IllegalArgumentException if [matterLevel] is outside 0..254
     */
    fun matterToIxora(matterLevel: Int): Int {
        require(matterLevel in 0..MATTER_MAX) {
            "matterLevel must be in 0..$MATTER_MAX, got $matterLevel"
        }
        if (matterLevel == 0) {
            return 0
        }
        // Round-half-up integer scaling: 254 → 255, preserves 0 → 0.
        return (matterLevel * IXORA_MAX + MATTER_MAX / 2) / MATTER_MAX
    }

    /**
     * Convert an Ixora domain brightness (0–255) to a Matter native level
     * (0–254). Domain value 255 maps to Matter 254 (the maximum valid Matter
     * level — never 255, which is reserved in the protocol).
     *
     * @throws IllegalArgumentException if [ixoraLevel] is outside 0..255
     */
    fun ixoraToMatter(ixoraLevel: Int): Int {
        require(ixoraLevel in 0..IXORA_MAX) {
            "ixoraLevel must be in 0..$IXORA_MAX, got $ixoraLevel"
        }
        if (ixoraLevel == 0) {
            return 0
        }
        if (ixoraLevel == IXORA_MAX) {
            return MATTER_MAX
        }
        return (ixoraLevel * MATTER_MAX + IXORA_MAX / 2) / IXORA_MAX
    }
}
