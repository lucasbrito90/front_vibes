/**
 * player-debug.ts — Shared structured logger for the entire player flow.
 *
 * Every module (store, service, components, router) calls `createLogger(prefix)`
 * to get a namespaced logger. Each log entry is:
 *   1. Written to the browser / ADB console with a consistent format.
 *   2. Prepended to `logBuffer` — a reactive ref that the in-app DEV Logs
 *      panel inside VibePlayerPage.vue reads in real time on the device.
 *
 * TEMPORARY DEV INSTRUMENTATION — gate or remove before production.
 */

import { ref } from 'vue';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  /** HH:mm:ss.mmm extracted from Date.toTimeString() */
  ts: string;
  level: 'debug' | 'warn' | 'error';
  prefix: string;
  message: string;
  /** Optional structured context object serialised in the panel. */
  data?: Record<string, unknown>;
}

// ── Reactive buffer ───────────────────────────────────────────────────────────

/** Max entries kept in memory / shown in the in-app panel. */
const MAX_ENTRIES = 100;

/**
 * Reactive log buffer — newest entry at index 0.
 * Import this in VibePlayerPage.vue to drive the in-app DEV Logs panel.
 */
export const logBuffer = ref<LogEntry[]>([]);

export function clearLogBuffer(): void {
  logBuffer.value = [];
}

// ── Internal push ─────────────────────────────────────────────────────────────

function _push(
  level: LogEntry['level'],
  prefix: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const ts   = new Date().toTimeString().slice(0, 12); // "HH:mm:ss.mmm"
  const line = `[${ts}][${prefix}] ${message}`;

  if (level === 'error') {
    data ? console.error(line, data) : console.error(line);
  } else if (level === 'warn') {
    data ? console.warn(line, data) : console.warn(line);
  } else {
    data ? console.log(line, data) : console.log(line);
  }

  const entry: LogEntry = { ts, level, prefix, message, data };
  logBuffer.value = [entry, ...logBuffer.value.slice(0, MAX_ENTRIES - 1)];
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a { debug, warn, error } logger bound to the given prefix.
 *
 * Usage:
 *   const log = createLogger('PlayerStore');
 *   log.debug('playPlan called', { layers: 3 });
 *   // → console: [12:34:56.789][PlayerStore] playPlan called  { layers: 3 }
 *   // → logBuffer entry prepended
 */
export function createLogger(prefix: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => _push('debug', prefix, msg, data),
    warn:  (msg: string, data?: Record<string, unknown>) => _push('warn',  prefix, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => _push('error', prefix, msg, data),
  };
}
