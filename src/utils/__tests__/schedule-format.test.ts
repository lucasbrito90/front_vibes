import { describe, expect, it } from 'vitest';

import {
  WEEKDAY_OPTIONS,
  formatWeekdayList,
  isWeeklyConfigValid,
  recurrenceSummary,
  recurrenceTypeLabel,
} from '@/utils/schedule-format';

describe('recurrenceTypeLabel', () => {
  it('labels each MVP recurrence type', () => {
    expect(recurrenceTypeLabel('once')).toBe('Once');
    expect(recurrenceTypeLabel('daily')).toBe('Daily');
    expect(recurrenceTypeLabel('weekdays')).toContain('Mon');
    expect(recurrenceTypeLabel('weekly')).toBe('Weekly');
  });
});

describe('isWeeklyConfigValid', () => {
  it('requires at least one day for weekly recurrence', () => {
    expect(isWeeklyConfigValid('weekly', [])).toBe(false);
    expect(isWeeklyConfigValid('weekly', undefined)).toBe(false);
    expect(isWeeklyConfigValid('weekly', null)).toBe(false);
    expect(isWeeklyConfigValid('weekly', [1])).toBe(true);
    expect(isWeeklyConfigValid('weekly', [1, 3, 5])).toBe(true);
  });

  it('rejects out-of-range ISO weekday values', () => {
    expect(isWeeklyConfigValid('weekly', [0])).toBe(false);
    expect(isWeeklyConfigValid('weekly', [8])).toBe(false);
  });

  it('treats non-weekly recurrence as always valid regardless of days', () => {
    expect(isWeeklyConfigValid('once', [])).toBe(true);
    expect(isWeeklyConfigValid('daily', undefined)).toBe(true);
    expect(isWeeklyConfigValid('weekdays', null)).toBe(true);
  });
});

describe('formatWeekdayList', () => {
  it('orders days using the ISO Monday-first order', () => {
    expect(formatWeekdayList([5, 1, 3])).toBe('Mon, Wed, Fri');
    expect(formatWeekdayList([7])).toBe('Sun');
    expect(formatWeekdayList([])).toBe('');
  });

  it('exposes seven ISO weekday options Monday through Sunday', () => {
    expect(WEEKDAY_OPTIONS).toHaveLength(7);
    expect(WEEKDAY_OPTIONS[0].iso).toBe(1);
    expect(WEEKDAY_OPTIONS[6].iso).toBe(7);
  });
});

describe('recurrenceSummary', () => {
  it('summarizes weekly recurrence with the selected days', () => {
    expect(
      recurrenceSummary({ recurrence_type: 'weekly', recurrence_config: { days_of_week: [1, 5] } }),
    ).toBe('Weekly · Mon, Fri');
  });

  it('falls back to the plain weekly label when no days are configured', () => {
    expect(recurrenceSummary({ recurrence_type: 'weekly', recurrence_config: null })).toBe('Weekly');
  });

  it('summarizes non-weekly recurrence with the type label', () => {
    expect(recurrenceSummary({ recurrence_type: 'daily', recurrence_config: null })).toBe('Daily');
  });
});
