/**
 * ADR-031 sampling policy for front_vibes (mobile) telemetry.
 *
 * Rules:
 *  - 5 % of success spans / log records are exported.
 *  - 100 % of error / crash spans / log records are always exported.
 *
 * Pure functions — no side effects, injectable RNG for deterministic tests.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Decides whether to export a span.
 *
 * @param isError  True when the span represents an error or crash (status ERROR).
 * @param random   Seeded RNG — defaults to Math.random for production.
 */
export function shouldExportSpan(
  isError: boolean,
  random: () => number = Math.random,
): boolean {
  if (isError) return true;
  return random() < 0.05;
}

/**
 * Decides whether to export a log record.
 *
 * @param level   OTel log severity level.
 * @param random  Seeded RNG — defaults to Math.random for production.
 */
export function shouldExportLog(
  level: LogLevel,
  random: () => number = Math.random,
): boolean {
  if (level === 'error') return true;
  return random() < 0.05;
}
