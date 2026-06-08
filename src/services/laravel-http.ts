/**
 * Laravel API HTTP transport.
 *
 * On native Android/iOS with a local HTTP API (`http://<lan-ip>:8000`), WebView `fetch()`
 * is subject to mixed-content and CORS from `https://localhost`. Use CapacitorHttp
 * (native stack) instead — same approach as offline CDN downloads.
 *
 * Staging/production APIs are HTTPS → keep using normal `fetch()`.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type LaravelHttpTransport = 'capacitor-http' | 'fetch';

export type LaravelFetchInit = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
};

export type LaravelHttpResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'json' | 'text'>;

const CONNECT_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 30_000;

function laravelHttpQaEnabled(): boolean {
  return (
    import.meta.env.DEV
    || String(import.meta.env.VITE_ENABLE_NATIVE_QA_DIAGNOSTICS ?? '').toLowerCase() === 'true'
  );
}

function logLaravelHttpQa(message: string, detail?: Record<string, unknown>): void {
  if (!laravelHttpQaEnabled()) return;
  console.warn('[laravel-http:qa]', message, detail ?? {});
}

/** Normalized API origin from `VITE_API_BASE_URL` (no trailing slash). */
export function normalizedApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

/** True when the configured API base uses plain HTTP. */
export function isHttpApiBase(base: string = normalizedApiBase()): boolean {
  return base.toLowerCase().startsWith('http://');
}

/** Native platform + HTTP request URL → route through CapacitorHttp. */
export function shouldUseCapacitorHttpForApi(base: string = normalizedApiBase()): boolean {
  return Capacitor.isNativePlatform() && isHttpApiBase(base);
}

function shouldUseCapacitorHttpForUrl(url: string): boolean {
  return Capacitor.isNativePlatform() && url.toLowerCase().startsWith('http://');
}

/** Resolved transport for the current build + platform (QA diagnostics only). */
export function resolveLaravelHttpTransport(base: string = normalizedApiBase()): LaravelHttpTransport {
  return shouldUseCapacitorHttpForApi(base) ? 'capacitor-http' : 'fetch';
}

export function requireApiBase(): string {
  const base = normalizedApiBase();
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set');
  }
  return base;
}

/** Build absolute Laravel API URL from a path such as `/api/auth/sync`. */
export function laravelApiUrl(path: string, base: string = requireApiBase()): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function flattenHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  const h = new Headers(headers);
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function hasAuthorizationHeader(headers?: HeadersInit): boolean {
  if (!headers) return false;
  const h = new Headers(headers);
  return Boolean(h.get('Authorization')?.trim());
}

function bodyToString(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  return undefined;
}

function capacitorDataToText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'object') return JSON.stringify(data);
  return String(data);
}

function wrapCapacitorResponse(status: number, data: unknown, headerMap: Record<string, string>): LaravelHttpResponse {
  let textCache: string | null = null;

  const readText = (): string => {
    if (textCache === null) {
      textCache = capacitorDataToText(data);
    }
    return textCache;
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headerMap),
    async json(): Promise<unknown> {
      const text = readText();
      if (!text) return null;
      return JSON.parse(text) as unknown;
    },
    async text(): Promise<string> {
      return readText();
    },
  };
}

async function capacitorHttpFetch(url: string, init: LaravelFetchInit = {}): Promise<LaravelHttpResponse> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = flattenHeaders(init.headers);
  const body = bodyToString(init.body);

  const request: Parameters<typeof CapacitorHttp.request>[0] = {
    url,
    method,
    headers,
    connectTimeout: CONNECT_TIMEOUT_MS,
    readTimeout: READ_TIMEOUT_MS,
    responseType: 'json',
  };

  if (body !== undefined) {
    request.data = body;
  }

  logLaravelHttpQa('capacitor-http request', {
    method,
    url,
    hasAuthorization: hasAuthorizationHeader(init.headers),
  });

  try {
    const response = await CapacitorHttp.request(request);
    const headerMap: Record<string, string> = {};
    const rawHeaders = response.headers ?? {};
    for (const [key, value] of Object.entries(rawHeaders)) {
      headerMap[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    logLaravelHttpQa('capacitor-http response', {
      status: response.status,
      url,
    });

    return wrapCapacitorResponse(response.status, response.data, headerMap);
  } catch (err) {
    logLaravelHttpQa('capacitor-http network error', {
      url,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Drop-in `fetch()` for Laravel API calls. Uses CapacitorHttp on native + HTTP API;
 * otherwise delegates to WebView `fetch()`.
 */
export async function laravelFetch(
  input: string | URL,
  init: LaravelFetchInit = {},
): Promise<LaravelHttpResponse> {
  const url = typeof input === 'string' ? input : input.toString();

  if (shouldUseCapacitorHttpForUrl(url)) {
    return capacitorHttpFetch(url, init);
  }

  logLaravelHttpQa('fetch request', {
    method: init.method ?? 'GET',
    url,
    hasAuthorization: hasAuthorizationHeader(init.headers),
  });

  const response = await fetch(url, init);

  logLaravelHttpQa('fetch response', {
    status: response.status,
    url,
  });

  return response;
}
