import { type BootstrapMode, type DogfoodAttemptSummary } from './types.ts';
import {
  type CookieJar,
  type DogfoodHttpClient,
  DogfoodHttpTransportError,
} from './http-client.ts';

export interface AllowedBootstrapPayload {
  email: string;
  name: string;
  preferredLanguage: string;
  destination: string;
  [key: string]: unknown;
}

export interface BootstrapBaseResult {
  scenarioId: string;
  baseUrl: string;
  site: string;
  timestamp: string;
  patientSession: string | null;
  patientRestore: string | null;
  widgetChatTargetSessionId: string | null;
  redactedCookies: string[];
  attempts: DogfoodAttemptSummary[];
}

export interface BootstrapSuccessResult extends BootstrapBaseResult {
  bootstrapMode: 'chat_allowed';
}

export interface BootstrapBlockedResult extends BootstrapBaseResult {
  bootstrapMode: 'blocked_expected';
}

export interface BootstrapFailureResult extends BootstrapBaseResult {
  bootstrapMode: 'bootstrap_failed';
  failureKind: 'http_status' | 'missing_allowed_evidence' | 'timeout' | 'transport_error';
  status?: number;
  message: string;
  responseBody?: unknown;
  responseBodyText?: string | null;
}

export type BootstrapOutcome = BootstrapSuccessResult | BootstrapBlockedResult | BootstrapFailureResult;

export interface BootstrapRealApiSessionOptions {
  client: DogfoodHttpClient;
  scenarioId: string;
  bootstrapMode: BootstrapMode;
  timestamp: string;
  onboardingPayload?: AllowedBootstrapPayload;
  blockedProbePayload?: Record<string, unknown>;
  timeoutMs?: number;
  maxAttempts?: number;
}

function requireAllowedPayload(onboardingPayload: AllowedBootstrapPayload | undefined) {
  const payload = onboardingPayload ?? ({} as AllowedBootstrapPayload);
  const requiredFields: Array<keyof AllowedBootstrapPayload> = [
    'email',
    'name',
    'preferredLanguage',
    'destination',
  ];

  for (const field of requiredFields) {
    const value = payload[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Missing required onboarding payload field: ${field}`);
    }
  }

  return {
    email: payload.email.trim(),
    name: payload.name.trim(),
    preferredLanguage: payload.preferredLanguage.trim(),
    destination: payload.destination.trim(),
    ...Object.fromEntries(
      Object.entries(payload).filter(([key]) => !requiredFields.includes(key as keyof AllowedBootstrapPayload)),
    ),
  };
}

function getCookieValue(cookieJar: CookieJar, cookieName: string) {
  return cookieJar.get(cookieName);
}

function buildBaseResult({
  client,
  scenarioId,
  timestamp,
  attempts,
}: Pick<BootstrapRealApiSessionOptions, 'client' | 'scenarioId' | 'timestamp'> & {
  attempts: DogfoodAttemptSummary[];
}): BootstrapBaseResult {
  return {
    scenarioId,
    baseUrl: client.baseUrl,
    site: client.site,
    timestamp,
    patientSession: null,
    patientRestore: null,
    widgetChatTargetSessionId: null,
    redactedCookies: client.cookieJar.getRedactedCookies(),
    attempts,
  };
}

function isAllowedEvidence(body: unknown, cookieJar: CookieJar) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const widgetChatTarget = (body as { widgetChatTarget?: { kind?: string; sessionId?: string } }).widgetChatTarget;
  const sessionId = widgetChatTarget?.sessionId;
  const kind = widgetChatTarget?.kind;
  const patientSession = getCookieValue(cookieJar, 'patient_session');
  const patientRestore = getCookieValue(cookieJar, 'patient_restore');

  if (kind === 'CHATBOT_SESSION' && typeof sessionId === 'string' && sessionId.trim() && patientSession && patientRestore) {
    return {
      patientSession,
      patientRestore,
      widgetChatTargetSessionId: sessionId,
    };
  }

  return null;
}

function hasBlockedPrereqSignal(body: unknown) {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as {
    code?: unknown;
    details?: Array<{
      path?: unknown;
      code?: unknown;
      received?: unknown;
    }>;
  };

  if (candidate.code !== 'VALIDATION_FAILED' || !Array.isArray(candidate.details)) {
    return false;
  }

  return candidate.details.some((detail) => {
    if (!detail || typeof detail !== 'object') {
      return false;
    }

    const path = Array.isArray(detail.path) ? detail.path : [];
    return path.length === 1 && path[0] === 'name' && detail.received === 'undefined';
  });
}

function classifyTransportError({
  client,
  scenarioId,
  timestamp,
  error,
  attempts,
}: {
  client: DogfoodHttpClient;
  scenarioId: string;
  timestamp: string;
  error: unknown;
  attempts: DogfoodAttemptSummary[];
}): BootstrapFailureResult {
  const failureKind = error instanceof DogfoodHttpTransportError ? error.kind : 'transport_error';
  const message =
    error instanceof Error ? error.message : `Request failed: ${String(error)}`;

  return {
    ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
    bootstrapMode: 'bootstrap_failed',
    failureKind,
    message,
  };
}

function classifyResponse({
  client,
  scenarioId,
  timestamp,
  response,
  bootstrapMode,
  attempts,
}: {
  client: DogfoodHttpClient;
  scenarioId: string;
  timestamp: string;
  response: {
    status: number;
    body: unknown;
    bodyText: string | null;
  };
  bootstrapMode: BootstrapMode;
  attempts: DogfoodAttemptSummary[];
}): BootstrapOutcome {
  const allowedEvidence = isAllowedEvidence(response.body, client.cookieJar);

  if (bootstrapMode === 'chat_allowed') {
    if (response.status === 401 || response.status === 403) {
      return {
        ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
        bootstrapMode: 'bootstrap_failed',
        failureKind: 'http_status',
        status: response.status,
        message: `Bootstrap failed with HTTP ${response.status}.`,
        responseBody: response.body,
        responseBodyText: response.bodyText,
      };
    }

    if (response.status !== 200) {
      return {
        ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
        bootstrapMode: 'bootstrap_failed',
        failureKind: 'http_status',
        status: response.status,
        message: `Bootstrap failed with HTTP ${response.status}.`,
        responseBody: response.body,
        responseBodyText: response.bodyText,
      };
    }

    if (!allowedEvidence) {
      return {
        ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
        bootstrapMode: 'bootstrap_failed',
        failureKind: 'missing_allowed_evidence',
        status: response.status,
        message: 'Bootstrap did not return the required patient_session, patient_restore, and widgetChatTarget.sessionId evidence.',
        responseBody: response.body,
        responseBodyText: response.bodyText,
      };
    }

    return {
      ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
      bootstrapMode: 'chat_allowed',
      patientSession: allowedEvidence.patientSession,
      patientRestore: allowedEvidence.patientRestore,
      widgetChatTargetSessionId: allowedEvidence.widgetChatTargetSessionId,
      redactedCookies: client.cookieJar.getRedactedCookies(),
    };
  }

  if (response.status !== 200 && !(response.status === 400 && hasBlockedPrereqSignal(response.body))) {
    return {
      ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
      bootstrapMode: 'bootstrap_failed',
      failureKind: 'http_status',
      status: response.status,
      message: `Blocked-path bootstrap failed with HTTP ${response.status}.`,
      responseBody: response.body,
      responseBodyText: response.bodyText,
    };
  }

  if (allowedEvidence) {
    return {
      ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
      bootstrapMode: 'bootstrap_failed',
      failureKind: 'missing_allowed_evidence',
      status: response.status,
      message: 'Blocked-path bootstrap unexpectedly established chat eligibility.',
      responseBody: response.body,
      responseBodyText: response.bodyText,
    };
  }

  return {
    ...buildBaseResult({ client, scenarioId, timestamp, attempts }),
    bootstrapMode: 'blocked_expected',
    redactedCookies: client.cookieJar.getRedactedCookies(),
  };
}

function isRetriableBootstrapError(error: unknown) {
  return (
    error instanceof DogfoodHttpTransportError &&
    (error.kind === 'timeout' || error.kind === 'transport_error')
  );
}

export async function bootstrapRealApiSession({
  client,
  scenarioId,
  bootstrapMode,
  timestamp,
  onboardingPayload,
  blockedProbePayload,
  timeoutMs,
  maxAttempts,
}: BootstrapRealApiSessionOptions): Promise<BootstrapOutcome> {
  const payload =
    bootstrapMode === 'chat_allowed'
      ? requireAllowedPayload(onboardingPayload)
      : blockedProbePayload ?? {
          email: 'blocked-probe@example.com',
        };

  const attempts: DogfoodAttemptSummary[] = [];
  const requestTimeoutMs = timeoutMs ?? 30_000;
  const requestMaxAttempts = Math.max(1, Math.floor(maxAttempts ?? 1));

  for (let attempt = 1; attempt <= requestMaxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const exchange = await client.request({
        method: 'POST',
        path: '/api/patient/onboarding/init',
        body: payload,
        timeoutMs: requestTimeoutMs,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      attempts.push({
        phase: 'bootstrap',
        turnIndex: null,
        attempt,
        durationMs: Date.now() - startedAt,
        status: exchange.response.status,
        retried: false,
      });

      return classifyResponse({
        client,
        scenarioId,
        timestamp,
        response: exchange.response,
        bootstrapMode,
        attempts,
      });
    } catch (error) {
      const shouldRetry = isRetriableBootstrapError(error) && attempt < requestMaxAttempts;
      attempts.push({
        phase: 'bootstrap',
        turnIndex: null,
        attempt,
        durationMs: Date.now() - startedAt,
        transportErrorKind: error instanceof DogfoodHttpTransportError ? error.kind : 'transport_error',
        errorMessage: error instanceof Error ? error.message : String(error),
        retried: shouldRetry,
      });

      if (shouldRetry) {
        continue;
      }

      return classifyTransportError({
        client,
        scenarioId,
        timestamp,
        error,
        attempts,
      });
    }
  }

  throw new Error('Bootstrap retry loop exited unexpectedly.');
}
