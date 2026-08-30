/**
 * Derives a stable, low-cardinality screen name for telemetry span naming
 * (`screen.{screenName}` — ADR-029 §"Span naming").
 *
 * `meta.screenName` (set explicitly per route in `router/index.ts`) is always
 * the source of truth. This module only covers the fallback for a route that
 * doesn't set it: it derives the name from the route's path *template*
 * (e.g. "devices/:id"), never from the resolved URL — so a dynamic segment's
 * actual value (a numeric ID, etc.) can never leak into the span name.
 */

export type MatchedRouteLike = { path: string };

export function routeTemplateToScreenName(matched: MatchedRouteLike[]): string {
  const template = matched[matched.length - 1]?.path ?? 'unknown';
  const segment =
    template
      .split('/')
      .filter((s) => Boolean(s) && !s.startsWith(':'))
      .pop() ?? 'root';

  return (
    segment
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') + 'Page'
  );
}
