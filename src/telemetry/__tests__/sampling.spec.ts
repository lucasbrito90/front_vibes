import { describe, it, expect } from 'vitest';
import { shouldExportSpan, shouldExportLog } from '../sampling';

describe('shouldExportSpan', () => {
  it('always returns true for error spans (ADR-031: 100 % sampling)', () => {
    // Even with a RNG that always returns 0, errors are always exported.
    for (let i = 0; i < 50; i++) {
      expect(shouldExportSpan(true, () => 0)).toBe(true);
    }
  });

  it('always returns true for error spans regardless of RNG value', () => {
    expect(shouldExportSpan(true, () => 0.99)).toBe(true);
    expect(shouldExportSpan(true, () => 1)).toBe(true);
  });

  it('exports success spans at ~5 % (RNG below threshold)', () => {
    // RNG returning 0.04 < 0.05 → export
    expect(shouldExportSpan(false, () => 0.04)).toBe(true);
  });

  it('drops success spans at 95 % (RNG at or above threshold)', () => {
    // RNG returning 0.05 → NOT exported (boundary is exclusive)
    expect(shouldExportSpan(false, () => 0.05)).toBe(false);
    expect(shouldExportSpan(false, () => 0.5)).toBe(false);
    expect(shouldExportSpan(false, () => 0.99)).toBe(false);
  });

  it('uses Math.random by default without crashing', () => {
    // Just verify it returns a boolean and does not throw
    const result = shouldExportSpan(false);
    expect(typeof result).toBe('boolean');
  });
});

describe('shouldExportLog', () => {
  it('always exports error logs (ADR-031)', () => {
    expect(shouldExportLog('error', () => 1)).toBe(true);
    expect(shouldExportLog('error', () => 0.99)).toBe(true);
  });

  it('samples non-error logs at 5 %', () => {
    expect(shouldExportLog('warn', () => 0.04)).toBe(true);
    expect(shouldExportLog('warn', () => 0.05)).toBe(false);
    expect(shouldExportLog('info', () => 0.04)).toBe(true);
    expect(shouldExportLog('info', () => 0.06)).toBe(false);
    expect(shouldExportLog('debug', () => 0.04)).toBe(true);
    expect(shouldExportLog('debug', () => 0.1)).toBe(false);
  });
});
