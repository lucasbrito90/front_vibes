/**
 * Timezone-aware helpers for the Scheduler MVP mobile CRUD.
 *
 * Per ADR-009 the backend stores `start_time` / `next_run_at` as UTC instants and
 * expands recurrence in the schedule's own IANA timezone. The mobile form lets the
 * user pick a wall-clock time *in the chosen schedule timezone*, so on submit we must
 * convert that wall-clock value to a UTC ISO string the API can store and re-expand
 * back to the same local time. For display we format UTC instants back into the
 * schedule timezone.
 *
 * No external date library — uses `Intl.DateTimeFormat` only (available in WebView +
 * jsdom). DST is handled by a single offset correction, which is sufficient for the
 * MVP (the spec defers complex DST edge-case UI).
 */

/** Device IANA timezone — used as the default suggestion on create. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Offset (ms) of `timeZone` from UTC at the given instant: localWallClock - utc. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  const hour = map.hour === '24' ? '00' : map.hour;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second),
  );

  return asUtc - instant.getTime();
}

/** Pad to two digits. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Convert a wall-clock value (`YYYY-MM-DDTHH:mm` or with seconds) interpreted in
 * `timeZone` into a UTC ISO-8601 string (with `Z`).
 */
export function zonedWallTimeToUtcISO(wallTime: string, timeZone: string): string {
  const trimmed = wallTime.trim();
  if (!trimmed) {
    throw new Error('A start date and time is required.');
  }

  // ion-datetime may emit an offset/Z already (e.g. when bound to a full ISO).
  // Strip any trailing zone designator so we treat the components as wall time.
  const naive = trimmed
    .replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '')
    .replace(/\.\d+$/, '');
  const withSeconds = naive.length === 16 ? `${naive}:00` : naive;

  // Pretend the wall-clock components are UTC, then correct by the zone offset.
  const pretendUtc = new Date(`${withSeconds}Z`);
  if (Number.isNaN(pretendUtc.getTime())) {
    throw new Error('Invalid start date and time.');
  }

  const offset = timeZoneOffsetMs(pretendUtc, timeZone);
  return new Date(pretendUtc.getTime() - offset).toISOString();
}

/**
 * Convert a UTC ISO instant into a wall-clock string (`YYYY-MM-DDTHH:mm:ss`) for the
 * given `timeZone`, suitable for binding to `ion-datetime` in edit mode.
 */
export function utcISOToZonedWallTime(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return '';
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
}

/**
 * Format a UTC instant for display in the schedule's timezone. Falls back to device
 * formatting when the timezone is invalid or unavailable.
 */
export function formatInstantInZone(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(instant);
  } catch {
    return instant.toLocaleString();
  }
}

/** Current wall-clock value in `timeZone` as `YYYY-MM-DDTHH:mm:ss` (datetime default). */
export function nowZonedWallTime(timeZone: string): string {
  return utcISOToZonedWallTime(new Date().toISOString(), timeZone);
}

/** Build a wall-clock string from a Date in the given timezone. Test/util helper. */
export function dateToZonedWallTime(date: Date, timeZone: string): string {
  return utcISOToZonedWallTime(date.toISOString(), timeZone);
}

/** Re-export pad for callers needing consistent formatting. */
export { pad2 as padTwo };
