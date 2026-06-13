import { describe, expect, it } from 'vitest';

import {
  formatInstantInZone,
  utcISOToZonedWallTime,
  zonedWallTimeToUtcISO,
} from '@/utils/schedule-datetime';

describe('zonedWallTimeToUtcISO', () => {
  it('treats a UTC wall-clock time as the same UTC instant', () => {
    expect(zonedWallTimeToUtcISO('2026-06-13T08:30', 'UTC')).toBe('2026-06-13T08:30:00.000Z');
  });

  it('accepts a value that already has seconds', () => {
    expect(zonedWallTimeToUtcISO('2026-06-13T08:30:15', 'UTC')).toBe('2026-06-13T08:30:15.000Z');
  });

  it('strips a trailing zone designator and treats components as wall time', () => {
    expect(zonedWallTimeToUtcISO('2026-06-13T08:30:00Z', 'UTC')).toBe('2026-06-13T08:30:00.000Z');
  });

  it('converts a fixed-offset zone (Asia/Tokyo, +09:00, no DST) to UTC', () => {
    // 18:00 wall time in Tokyo (UTC+9) is 09:00 UTC.
    expect(zonedWallTimeToUtcISO('2026-06-13T18:00', 'Asia/Tokyo')).toBe('2026-06-13T09:00:00.000Z');
  });

  it('throws on empty input', () => {
    expect(() => zonedWallTimeToUtcISO('', 'UTC')).toThrow();
  });
});

describe('utcISOToZonedWallTime', () => {
  it('returns the UTC wall-clock time for the UTC zone', () => {
    expect(utcISOToZonedWallTime('2026-06-13T08:30:00.000Z', 'UTC')).toBe('2026-06-13T08:30:00');
  });

  it('round-trips wall time through UTC for a fixed-offset zone', () => {
    const utc = zonedWallTimeToUtcISO('2026-06-13T18:00', 'Asia/Tokyo');
    expect(utcISOToZonedWallTime(utc, 'Asia/Tokyo')).toBe('2026-06-13T18:00:00');
  });
});

describe('formatInstantInZone', () => {
  it('returns a placeholder for null instants', () => {
    expect(formatInstantInZone(null, 'UTC')).toBe('—');
    expect(formatInstantInZone(undefined, 'UTC')).toBe('—');
  });

  it('formats a valid instant without throwing', () => {
    const formatted = formatInstantInZone('2026-06-13T08:30:00.000Z', 'UTC');
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });
});
