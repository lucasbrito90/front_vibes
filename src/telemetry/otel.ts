/**
 * OpenTelemetry SDK bootstrap for front_vibes (mobile — Android WebView).
 *
 * Architecture decisions:
 *
 * 1. NO @opentelemetry/context-zone — zone.js adds ~80 KB to bundle.
 *    Navigation spans (screen.*) and network spans (fetch) are root-level;
 *    we don't need parent-child propagation across deep async boundaries.
 *    The default StackContextManager from sdk-trace-web is sufficient.
 *
 * 2. Tail sampling via exporter wrapper — OTel head-based samplers decide at
 *    span START before we know if the span ends in error. Using AlwaysOnSampler
 *    + a wrapper around the OTLP exporter lets us apply ADR-031 policy
 *    (5 % success / 100 % error) based on the final span status.
 *
 * 3. Fetch-based export, keepAlive:false — Android WebView's sendBeacon is
 *    unreliable. Explicit forceFlush() is called on Capacitor appStateChange.
 *
 * 4. Kill switch — if VITE_OTEL_ENDPOINT is empty/unset the entire bootstrap
 *    is a no-op. The app works identically with or without telemetry.
 *
 * 5. user.id — integer from laravelUser (not firebase_uid/email — ADR-030).
 *    Injected into every span/log via processors. Set on login, cleared on logout.
 */

import {
  trace,
  metrics,
  SpanStatusCode,
  type Tracer,
  type Span,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import { logs, type Logger, SeverityNumber } from '@opentelemetry/api-logs';
import {
  BatchSpanProcessor,
  AlwaysOnSampler,
  WebTracerProvider,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
  type LogRecordExporter,
} from '@opentelemetry/sdk-logs';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
} from '@opentelemetry/semantic-conventions';

import { shouldExportSpan, shouldExportLog, type LogLevel } from './sampling';
import { sanitizeErrorMessage, stripUrlQuery } from './pii-sanitizer';

// ── Config ────────────────────────────────────────────────────────────────────

const OTEL_ENDPOINT = (import.meta.env.VITE_OTEL_ENDPOINT as string | undefined)?.trim() ?? '';
const APP_ENV = (import.meta.env.VITE_OTEL_DEPLOYMENT_ENV as string | undefined)?.trim()
  || (import.meta.env.MODE === 'staging' ? 'staging' : 'development');
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || '0.0.1';
const SERVICE_NAME = 'front_vibes-android';

/** Integer user.id from back_vibes — NEVER firebase_uid or email (ADR-030). */
let _userId: number | null = null;

let _initialized = false;

let _tracerProvider: WebTracerProvider | null = null;
let _loggerProvider: LoggerProvider | null = null;
let _meterProvider: MeterProvider | null = null;

// ── Sampling wrappers ─────────────────────────────────────────────────────────

/**
 * SpanExporter wrapper applying ADR-031 mobile sampling:
 *  - 5 % success spans
 *  - 100 % error spans
 */
class SamplingSpanExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    const filtered = spans.filter((s) => shouldExportSpan(s.status.code === SpanStatusCode.ERROR));
    if (filtered.length === 0) {
      resultCallback({ code: 0 });
      return;
    }
    this.inner.export(filtered, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

/**
 * LogRecordExporter wrapper applying ADR-031 mobile sampling.
 */
class SamplingLogExporter implements LogRecordExporter {
  constructor(private readonly inner: LogRecordExporter) {}

  export(
    records: ReadableLogRecord[],
    resultCallback: Parameters<LogRecordExporter['export']>[1],
  ): void {
    const filtered = records.filter((r) => {
      const isError =
        r.severityNumber !== undefined && r.severityNumber >= SeverityNumber.ERROR;
      return shouldExportLog(isError ? 'error' : ('info' as LogLevel));
    });
    if (filtered.length === 0) {
      resultCallback({ code: 0 });
      return;
    }
    this.inner.export(filtered, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

// ── user.id injection ─────────────────────────────────────────────────────────

/** Injects user.id into every span as a span attribute (ADR-029, ADR-030). */
class UserIdSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    if (_userId !== null) {
      span.setAttribute('user.id', String(_userId));
    }
  }

  onEnd(): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

/** Injects user.id into every log record. */
class UserIdLogProcessor implements LogRecordProcessor {
  onEmit(record: ReadableLogRecord): void {
    if (_userId !== null) {
      // ReadableLogRecord exposes setAttribute in the SDK implementation
      (record as unknown as { setAttribute(k: string, v: string): void }).setAttribute(
        'user.id',
        String(_userId),
      );
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// ── Kill switch ───────────────────────────────────────────────────────────────

function isTelemetryEnabled(): boolean {
  return !!OTEL_ENDPOINT;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Initialize the OTel SDK. Safe to call multiple times — only runs once.
 * If VITE_OTEL_ENDPOINT is unset, this is a complete no-op.
 */
export function initTelemetry(): void {
  if (_initialized) return;
  _initialized = true;

  if (!isTelemetryEnabled()) return;

  try {
    _initTelemetryUnsafe();
  } catch (err) {
    // Bootstrap must NEVER crash the app (ADR-029 failure policy).
    console.warn('[telemetry] bootstrap failed — telemetry disabled:', err);
    _shutdown();
  }
}

function _initTelemetryUnsafe(): void {
  const endpoint = OTEL_ENDPOINT;
  const ingestKey = (import.meta.env.VITE_OTEL_INGEST_API_KEY as string | undefined)?.trim() ?? '';

  const headers: Record<string, string> = {};
  if (ingestKey) {
    headers['Authorization'] = `Bearer ${ingestKey}`;
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: APP_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: APP_ENV,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: 'webjs',
  });

  // ── Traces ──────────────────────────────────────────────────────────────────

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
    keepAlive: false,
  });

  _tracerProvider = new WebTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new UserIdSpanProcessor(),
      new BatchSpanProcessor(new SamplingSpanExporter(traceExporter), {
        maxExportBatchSize: 20,
        scheduledDelayMillis: 5000,
      }),
    ],
  });
  _tracerProvider.register();

  // ── Fetch instrumentation ───────────────────────────────────────────────────

  const fetchInstrumentation = new FetchInstrumentation({
    propagateTraceHeaderCorsUrls: [/staging-api\.ixora-app\.app/, /localhost/],
    // Ignore OTel export requests — prevents circular instrumentation
    ignoreUrls: [/otel-mobile-staging\.ixora-app\.app/, /otel-staging\.ixora-app\.app/],
    applyCustomAttributesOnSpan(span, request) {
      const rawUrl =
        typeof request === 'string' ? request : (request as Request).url ?? '';

      if (rawUrl) {
        // Strip query / fragment — may contain tokens (ADR-030)
        span.setAttribute('http.url', stripUrlQuery(rawUrl));

        try {
          const u = new URL(rawUrl);
          span.setAttribute('http.route', u.pathname);
          span.setAttribute('http.host', u.host);
        } catch { /* ignore */ }
      }

      // Explicitly mark Authorization as not recorded (ADR-030)
      span.setAttribute('http.request.header.authorization', '[NOT RECORDED]');
    },
  });

  fetchInstrumentation.setTracerProvider(_tracerProvider);
  fetchInstrumentation.enable();

  // ── Logs ────────────────────────────────────────────────────────────────────

  const logExporter = new OTLPLogExporter({
    url: `${endpoint}/v1/logs`,
    headers,
    keepAlive: false,
  });

  _loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new UserIdLogProcessor(),
      new BatchLogRecordProcessor({ exporter: new SamplingLogExporter(logExporter), maxExportBatchSize: 20, scheduledDelayMillis: 5000 }),
    ],
  });
  logs.setGlobalLoggerProvider(_loggerProvider);

  // ── Metrics ─────────────────────────────────────────────────────────────────

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
    headers,
    keepAlive: false,
  });

  _meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30_000,
      }),
    ],
  });
}

function _shutdown(): void {
  try { _tracerProvider?.shutdown(); } catch { /* silent */ }
  try { _loggerProvider?.shutdown(); } catch { /* silent */ }
  try { _meterProvider?.shutdown(); } catch { /* silent */ }
  _tracerProvider = null;
  _loggerProvider = null;
  _meterProvider = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the tracer. No-op tracer when telemetry is disabled. */
export function getTracer(name = SERVICE_NAME): Tracer {
  return trace.getTracer(name);
}

/** Returns the logger. No-op logger when telemetry is disabled. */
export function getLogger(name = SERVICE_NAME): Logger {
  return logs.getLogger(name);
}

/** Returns the meter. No-op meter when telemetry is disabled. */
export function getMeter(name = SERVICE_NAME) {
  if (_meterProvider) return _meterProvider.getMeter(name);
  return metrics.getMeter(name);
}

/**
 * Sets the authenticated back_vibes user ID (integer) for all subsequent
 * spans and logs. Call after /auth/sync. Clear on logout.
 * NEVER pass email or firebase_uid (ADR-030).
 */
export function setTelemetryUserId(userId: number | null): void {
  _userId = userId;
}

/**
 * Force-flushes buffered spans and logs. Call on Capacitor appStateChange
 * when the app goes to background (prevents data loss on Android WebView).
 */
export async function flushTelemetry(): Promise<void> {
  if (!_tracerProvider) return;
  try {
    await Promise.all([
      _tracerProvider.forceFlush(),
      _loggerProvider?.forceFlush(),
    ]);
  } catch (err) {
    console.warn('[telemetry] forceFlush failed:', err);
  }
}

/**
 * Emits a 100 %-sampled error log record with PII-sanitized message (ADR-030/031).
 * Used by the global error handlers in main.ts.
 */
export function emitErrorLog(
  message: string,
  attributes: Record<string, string | number | boolean> = {},
): void {
  if (!_loggerProvider) return;
  try {
    getLogger().emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: sanitizeErrorMessage(message),
      attributes: { 'deployment.environment': APP_ENV, ...attributes },
    });
  } catch (err) {
    console.warn('[telemetry] emitErrorLog failed:', err);
  }
}

/**
 * Creates a 100 %-sampled error span for unhandled exceptions (ADR-031).
 * Span status is ERROR → SamplingSpanExporter always keeps it.
 */
export function emitErrorSpan(
  spanName: string,
  errorMessage: string,
  attributes: Record<string, string | number | boolean> = {},
): void {
  if (!_tracerProvider) return;
  try {
    const span = getTracer().startSpan(spanName, { startTime: Date.now() }, ROOT_CONTEXT);
    span.setStatus({ code: SpanStatusCode.ERROR, message: sanitizeErrorMessage(errorMessage) });
    for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    span.end();
  } catch (err) {
    console.warn('[telemetry] emitErrorSpan failed:', err);
  }
}

// ── Navigation span helpers ───────────────────────────────────────────────────

let _activeScreenSpan: Span | null = null;
let _activeScreenStart = 0;
let _activeScreenName = '';

/** Ends the active screen span and records its duration metric. */
export function endCurrentScreenSpan(): void {
  if (!_activeScreenSpan) return;
  try {
    _activeScreenSpan.end();

    if (_meterProvider && _activeScreenName && _activeScreenStart > 0) {
      _meterProvider
        .getMeter(SERVICE_NAME)
        .createHistogram('ixora.mobile.screen.duration', {
          unit: 'ms',
          description: 'Duration the user spent on a screen (ms)',
        })
        .record(Date.now() - _activeScreenStart, {
          'screen.name': _activeScreenName,
          'deployment.environment': APP_ENV,
        });
    }
  } catch (err) {
    console.warn('[telemetry] endCurrentScreenSpan failed:', err);
  } finally {
    _activeScreenSpan = null;
    _activeScreenStart = 0;
    _activeScreenName = '';
  }
}

/**
 * Starts a new screen span. Called from router.afterEach.
 * Span name: `screen.{ScreenName}` (ADR-029).
 */
export function startScreenSpan(screenName: string): void {
  if (!_tracerProvider) return;
  try {
    _activeScreenSpan = getTracer().startSpan(`screen.${screenName}`, {}, ROOT_CONTEXT);
    _activeScreenStart = Date.now();
    _activeScreenName = screenName;
  } catch (err) {
    console.warn('[telemetry] startScreenSpan failed:', err);
  }
}
