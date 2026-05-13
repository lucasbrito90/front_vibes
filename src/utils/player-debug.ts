/**
 * player-debug.ts — Shared structured logger for the entire player flow.
 *
 * Every module (store, service, components, router) calls `createLogger(prefix)`
 * to get a namespaced logger. Behaviour by build mode:
 *
 *   DEV  (import.meta.env.DEV === true):
 *     debug → console.log + logBuffer
 *     warn  → console.warn + logBuffer
 *     error → console.error + logBuffer
 *
 *   PROD (import.meta.env.DEV === false):
 *     debug → silent (no console, no buffer)
 *     warn  → console.warn only  (no buffer)
 *     error → console.error only (no buffer)
 *
 * The logBuffer drives the in-app DEV Logs panel in VibePlayerPage.vue,
 * which is itself gated behind `import.meta.env.DEV` so it is never visible
 * in production builds.
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

/** Max entries kept in memory / shown in the in-app DEV panel. */
const MAX_ENTRIES = 100;

/**
 * Reactive log buffer — newest entry at index 0.
 * Only populated in DEV builds. Import in VibePlayerPage.vue for the panel.
 */
export const logBuffer = ref<LogEntry[]>([]);

export function clearLogBuffer(): void {
  logBuffer.value = [];
}

// ── Internal push ─────────────────────────────────────────────────────────────

const _isDev = import.meta.env.DEV;

function _push(
  level: LogEntry['level'],
  prefix: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  // debug messages are suppressed entirely in production
  if (level === 'debug' && !_isDev) return;

  const ts   = new Date().toTimeString().slice(0, 12); // "HH:mm:ss.mmm"
  const line = `[${ts}][${prefix}] ${message}`;

  if (level === 'error') {
    data ? console.error(line, data) : console.error(line);
  } else if (level === 'warn') {
    data ? console.warn(line, data) : console.warn(line);
  } else {
    data ? console.log(line, data) : console.log(line);
  }

  // buffer is only populated in DEV (warn/error always, debug already guarded)
  if (_isDev) {
    const entry: LogEntry = { ts, level, prefix, message, data };
    logBuffer.value = [entry, ...logBuffer.value.slice(0, MAX_ENTRIES - 1)];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a { debug, warn, error } logger bound to the given prefix.
 *
 * Usage:
 *   const log = createLogger('PlayerStore');
 *   log.debug('playPlan called', { layers: 3 });   // DEV only
 *   log.warn('NativeAudio failed', { err });        // always
 */
export function createLogger(prefix: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => _push('debug', prefix, msg, data),
    warn:  (msg: string, data?: Record<string, unknown>) => _push('warn',  prefix, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => _push('error', prefix, msg, data),
  };
}
