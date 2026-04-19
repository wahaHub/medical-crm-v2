export type HeaderDirection = 'request' | 'response';

export interface DogfoodHttpClientOptions {
  baseUrl: string;
  site: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  redactHeaderValue?: (name: string, value: string, direction: HeaderDirection) => string;
}

export interface DogfoodHttpRequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface DogfoodHttpExchange {
  url: string;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    redactedHeaders: Record<string, string>;
    body: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    redactedHeaders: Record<string, string>;
    body: unknown;
    bodyText: string | null;
    setCookieHeaders: string[];
  };
}

export interface DogfoodHttpClient {
  readonly baseUrl: string;
  readonly site: string;
  readonly cookieJar: CookieJar;
  request(options: DogfoodHttpRequestOptions): Promise<DogfoodHttpExchange>;
}

export class DogfoodHttpTransportError extends Error {
  readonly kind: 'timeout' | 'transport_error';

  constructor(kind: 'timeout' | 'transport_error', message: string, cause?: unknown) {
    super(message);
    this.name = 'DogfoodHttpTransportError';
    this.kind = kind;
    this.cause = cause;
  }
}

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  ingest(setCookieHeaders: string[]) {
    for (const setCookieHeader of setCookieHeaders) {
      const pair = setCookieHeader.split(';', 1)[0]?.trim();
      if (!pair) {
        continue;
      }

      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name) {
        this.cookies.set(name, value);
      }
    }
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  getRedactedCookies() {
    return Array.from(this.cookies.keys())
      .sort((left, right) => left.localeCompare(right))
      .map((name) => `${name}=REDACTED`);
  }

  get(name: string) {
    return this.cookies.get(name) ?? null;
  }
}

function normalizeBaseUrl(rawBaseUrl: string) {
  const parsed = new URL(rawBaseUrl);
  return parsed.toString().replace(/\/$/, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonMaybe(bodyText: string, contentType: string) {
  if (!bodyText) {
    return null;
  }

  const lowerContentType = contentType.toLowerCase();
  const shouldAttemptJson = lowerContentType.includes('json') || bodyText.startsWith('{') || bodyText.startsWith('[');
  if (!shouldAttemptJson) {
    return bodyText;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function getSetCookieHeaders(headers: Headers) {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie().filter(Boolean);
  }

  const raw = headers.get('set-cookie');
  if (!raw) {
    return [];
  }

  return raw
    .split(/,(?=\s*[^;,=]+=[^;,=]+)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function captureHeaders(headers: Headers, redactHeaderValue: DogfoodHttpClientOptions['redactHeaderValue'], direction: HeaderDirection) {
  const captured: Record<string, string> = {};
  const redacted: Record<string, string> = {};

  for (const [name, value] of headers.entries()) {
    captured[name] = value;
    redacted[name] = redactHeaderValue?.(name, value, direction) ?? defaultRedactHeaderValue(name, value);
  }

  return { captured, redacted };
}

function defaultRedactHeaderValue(name: string, value: string) {
  const lowered = name.toLowerCase();
  if (lowered === 'cookie' || lowered === 'set-cookie' || lowered === 'authorization' || lowered === 'x-api-key') {
    return '<redacted>';
  }

  return value;
}

export function createDogfoodHttpClient({
  baseUrl,
  site,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  redactHeaderValue,
}: DogfoodHttpClientOptions): DogfoodHttpClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const cookieJar = new CookieJar();

  return {
    baseUrl: normalizedBaseUrl,
    site,
    cookieJar,
    async request(options: DogfoodHttpRequestOptions): Promise<DogfoodHttpExchange> {
      const method = options.method ?? 'GET';
      const url = new URL(options.path, `${normalizedBaseUrl}/`).toString();
      const requestHeaders = new Headers(options.headers ?? {});
      if (requestHeaders.has('cookie')) {
        throw new Error('Caller-supplied cookie headers are not allowed; use the client cookie jar instead.');
      }

      requestHeaders.set('x-medora-site', site);

      const cookieHeader = cookieJar.getCookieHeader();
      if (cookieHeader) {
        requestHeaders.set('Cookie', cookieHeader);
      }

      let body: BodyInit | undefined;
      const originalBody = options.body ?? null;
      if (options.body !== undefined) {
        if (typeof options.body === 'string' || options.body instanceof Uint8Array || options.body instanceof ArrayBuffer) {
          body = options.body;
        } else if (isPlainObject(options.body) || Array.isArray(options.body)) {
          body = JSON.stringify(options.body);
          if (!requestHeaders.has('content-type')) {
            requestHeaders.set('Content-Type', 'application/json');
          }
        } else {
          body = String(options.body);
        }
      }

      const capturedRequestHeaders = new Headers(requestHeaders);
      const { captured: rawRequestHeaders, redacted: redactedRequestHeaders } = captureHeaders(
        capturedRequestHeaders,
        redactHeaderValue,
        'request',
      );

      const controller = new AbortController();
      const requestTimeoutMs = options.timeoutMs ?? timeoutMs;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);

      try {
        const response = await fetchImpl(url, {
          method,
          headers: requestHeaders,
          body,
          signal: controller.signal,
        });

        const bodyText = await response.text();
        const responseHeaders = response.headers ?? new Headers();
        const setCookieHeaders = getSetCookieHeaders(responseHeaders);
        cookieJar.ingest(setCookieHeaders);

        const { captured: rawResponseHeaders, redacted: redactedResponseHeaders } = captureHeaders(
          responseHeaders,
          redactHeaderValue,
          'response',
        );

        return {
          url,
          request: {
            method,
            path: options.path,
            headers: rawRequestHeaders,
            redactedHeaders: redactedRequestHeaders,
            body: originalBody,
          },
          response: {
            status: response.status,
            headers: rawResponseHeaders,
            redactedHeaders: redactedResponseHeaders,
            body: parseJsonMaybe(bodyText, responseHeaders.get('content-type') ?? ''),
            bodyText,
            setCookieHeaders,
          },
        };
      } catch (error) {
        const errorName = error instanceof Error ? error.name : '';
        if (timedOut || errorName === 'AbortError') {
          throw new DogfoodHttpTransportError(
            'timeout',
            `Request to ${url} timeout after ${requestTimeoutMs}ms`,
            error,
          );
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new DogfoodHttpTransportError('transport_error', `Request to ${url} failed: ${message}`, error);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
