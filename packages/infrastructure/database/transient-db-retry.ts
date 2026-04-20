const TRANSIENT_ERROR_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  /connection_closed/i,
  /connect_timeout/i,
  /read ECONNRESET/i,
  /write ECONNRESET/i,
  /write CONNECTION_CLOSED/i,
  /write CONNECT_TIMEOUT/i,
  /connect ECONNREFUSED/i,
  /connect ETIMEDOUT/i,
  /max client connections reached/i,
  /maxclientsinsessionmode/i,
  /max clients reached/i,
  /connection terminated unexpectedly/i,
  /server closed the connection unexpectedly/i,
  /terminating connection due to administrator command/i,
  /the database system is starting up/i,
  /socket closed unexpectedly/i,
];

function getErrorCause(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'cause' in error
    ? (error as { cause?: unknown }).cause
    : undefined;
}

export function isTransientDatabaseError(error: unknown): boolean {
  let current: unknown = error;

  while (current) {
    const message = current instanceof Error ? current.message : String(current);
    const code =
      typeof current === 'object' && current !== null && 'code' in current
        ? String((current as { code?: unknown }).code)
        : undefined;

    if (code && TRANSIENT_ERROR_CODES.has(code)) {
      return true;
    }

    if (TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
      return true;
    }

    current = getErrorCause(current);
  }

  return false;
}

export async function withTransientDatabaseRetry<T>(
  operation: string,
  run: () => Promise<T>,
  options: {
    retries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const shouldRetry = attempt < retries && isTransientDatabaseError(error);
      if (!shouldRetry) {
        throw error;
      }

      console.warn(
        `[DB] Transient failure during ${operation}, retrying ${attempt + 1}/${retries}:`,
        error instanceof Error ? error.message : error,
      );

      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
