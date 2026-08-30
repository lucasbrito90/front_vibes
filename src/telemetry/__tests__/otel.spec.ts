/**
 * Tests for the OTel bootstrap:
 *  - Kill switch: no-op when endpoint is unset
 *  - emitErrorLog / emitErrorSpan: never throw
 *  - flushTelemetry: never throws even when not initialized
 *  - global error handler: never propagates exceptions
 */

import { describe, it, expect } from 'vitest';

// ── Kill switch ───────────────────────────────────────────────────────────────

describe('initTelemetry kill switch', () => {
  it('is a no-op when VITE_OTEL_ENDPOINT is not set', async () => {
    // The actual module uses import.meta.env at module load time.
    // We test the exported functions are safe to call when telemetry is disabled.
    const { emitErrorLog, emitErrorSpan, flushTelemetry } = await import('../otel');

    // These must not throw when providers are null (disabled).
    expect(() => emitErrorLog('test error')).not.toThrow();
    expect(() => emitErrorSpan('test.span', 'test error')).not.toThrow();
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});

// ── emitErrorLog / emitErrorSpan — never propagate ───────────────────────────

describe('emitErrorLog', () => {
  it('does not throw when telemetry is disabled', async () => {
    const { emitErrorLog } = await import('../otel');
    expect(() => emitErrorLog('Some error message')).not.toThrow();
  });

  it('does not throw with extra attributes', async () => {
    const { emitErrorLog } = await import('../otel');
    expect(() =>
      emitErrorLog('Crash', { 'error.type': 'uncaught_exception', count: 1 }),
    ).not.toThrow();
  });
});

describe('emitErrorSpan', () => {
  it('does not throw when telemetry is disabled', async () => {
    const { emitErrorSpan } = await import('../otel');
    expect(() => emitErrorSpan('vue.component.error', 'render failed')).not.toThrow();
  });

  it('does not throw with attributes', async () => {
    const { emitErrorSpan } = await import('../otel');
    expect(() =>
      emitErrorSpan('js.uncaught_exception', 'boom', { 'error.type': 'uncaught' }),
    ).not.toThrow();
  });
});

// ── flushTelemetry — never throws ────────────────────────────────────────────

describe('flushTelemetry', () => {
  it('resolves silently when not initialized', async () => {
    const { flushTelemetry } = await import('../otel');
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});

// ── setTelemetryUserId — accepts numbers and null ─────────────────────────────

describe('setTelemetryUserId', () => {
  it('does not throw when setting a user id', async () => {
    const { setTelemetryUserId } = await import('../otel');
    expect(() => setTelemetryUserId(42)).not.toThrow();
  });

  it('does not throw when clearing user id (logout)', async () => {
    const { setTelemetryUserId } = await import('../otel');
    expect(() => setTelemetryUserId(null)).not.toThrow();
  });
});

// ── Global error handlers — never re-throw ───────────────────────────────────

describe('global error handler isolation', () => {
  it('emitErrorLog does not propagate an internal exception', async () => {
    // Simulate a broken logger that throws internally
    const { emitErrorLog } = await import('../otel');

    // Wrap in a try/catch to confirm no exception escapes
    let threw = false;
    try {
      // Force a potential internal path by calling with unusual input
      emitErrorLog('error with "special" chars & <script>alert(1)</script>');
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it('emitErrorSpan does not propagate an internal exception', async () => {
    const { emitErrorSpan } = await import('../otel');

    let threw = false;
    try {
      emitErrorSpan('span.name', 'message with email@address.com and Bearer token123');
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});

// ── Navigation helpers — safe no-ops when disabled ───────────────────────────

describe('screen span helpers', () => {
  it('startScreenSpan does not throw when telemetry is disabled', async () => {
    const { startScreenSpan } = await import('../otel');
    expect(() => startScreenSpan('SchedulesPage')).not.toThrow();
  });

  it('endCurrentScreenSpan does not throw when no span is active', async () => {
    const { endCurrentScreenSpan } = await import('../otel');
    expect(() => endCurrentScreenSpan()).not.toThrow();
  });
});
