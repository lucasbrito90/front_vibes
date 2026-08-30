/**
 * PII sanitization utilities for telemetry (ADR-030).
 *
 * Applied to error messages and stack traces before they are exported to the
 * Collector. Pure functions — no side effects, easy to unit-test.
 *
 * Patterns that MUST be redacted (ADR-030):
 *  - Email addresses
 *  - Bearer tokens (Authorization header values)
 *  - JWT-shaped strings (three base64url segments)
 *
 * The Collector runs its own attribute processor as a second line of defence,
 * but the app is the primary gate (ADR-030 §"Application responsibility").
 */

const PII_PATTERNS: RegExp[] = [
  // Email addresses
  /[a-zA-Z0-9_.+]+@[a-zA-Z0-9]+\.[a-zA-Z0-9.]{2,}/g,
  // Bearer tokens inline (e.g. from error messages that accidentally include the header)
  /Bearer [A-Za-z0-9._~+/]+=*/g,
  // JWT-shaped strings (header.payload.signature — each segment ≥ 10 base64url chars)
  /ey[A-Za-z0-9_]{10,}\.[A-Za-z0-9_]{10,}\.[A-Za-z0-9_]+/g,
];

/**
 * Removes known PII patterns from an error message / stack trace fragment.
 * Falls back gracefully on non-string input.
 */
export function sanitizeErrorMessage(message: string): string {
  let result = message;
  for (const pattern of PII_PATTERNS) {
    pattern.lastIndex = 0; // reset stateful global regexes
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Strips query string and fragment from a URL so that token-bearing query params
 * (e.g. `?token=...`) are never stored as span attributes (ADR-030 §"Trace redaction").
 */
export function stripUrlQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    // Relative or malformed URL — strip naively
    return url.split('?')[0].split('#')[0];
  }
}
