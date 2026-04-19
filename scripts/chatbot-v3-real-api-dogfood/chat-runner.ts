import type { BootstrapSuccessResult } from './bootstrap.ts';
import { type DogfoodHttpClient } from './http-client.ts';

export type ChatRunnerRetryPolicy = 'stop_on_hard_failure' | 'allow_retry_after_hard_failure';

export interface ChatRunnerScenario {
  id: string;
  retryPolicy: ChatRunnerRetryPolicy;
}

export interface ChatRunnerTurnInput {
  message: string;
  attachments?: unknown[];
  pageContext?: unknown;
}

export interface ChatRunnerJourneySummary {
  stage: string;
  phase: string;
}

export interface ChatRunnerTurnTranscript {
  requestUrl: string;
  requestPayload: unknown;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  responseBody: unknown;
  responseBodyText: string | null;
  responseHeaders: Record<string, string>;
  journeySummary: ChatRunnerJourneySummary | null;
}

export interface ChatRunnerResult {
  scenarioId: string;
  stoppedEarly: boolean;
  bootstrapMode: BootstrapSuccessResult['bootstrapMode'];
  turns: ChatRunnerTurnTranscript[];
}

export interface RunChatSessionOptions {
  client: DogfoodHttpClient;
  bootstrap: BootstrapSuccessResult;
  scenario: ChatRunnerScenario;
  turns: ChatRunnerTurnInput[];
  requestTimeoutMs?: number;
}

function requireAllowedBootstrap(bootstrap: BootstrapSuccessResult) {
  if (bootstrap.bootstrapMode !== 'chat_allowed') {
    throw new Error(`Chat runner requires a chat_allowed bootstrap result, got ${bootstrap.bootstrapMode}.`);
  }

  if (!bootstrap.patientSession || !bootstrap.patientRestore || !bootstrap.widgetChatTargetSessionId) {
    throw new Error('Chat runner requires patient_session, patient_restore, and widgetChatTarget.sessionId evidence.');
  }
}

function seedBootstrapCookies(client: DogfoodHttpClient, bootstrap: BootstrapSuccessResult) {
  client.cookieJar.ingest([
    `patient_session=${bootstrap.patientSession}; Path=/; HttpOnly`,
    `patient_restore=${bootstrap.patientRestore}; Path=/; HttpOnly`,
  ]);
}

function extractJourneySummary(body: unknown): ChatRunnerJourneySummary | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = (
    body as {
      journey?: { stage?: unknown; phase?: unknown };
      journeySummary?: { stage?: unknown; phase?: unknown };
    }
  ).journeySummary ?? (body as { journey?: { stage?: unknown; phase?: unknown } }).journey;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const stage = candidate.stage;
  const phase = candidate.phase;
  if (typeof stage !== 'string' || !stage.trim() || typeof phase !== 'string' || !phase.trim()) {
    return null;
  }

  return {
    stage,
    phase,
  };
}

function isHardFailureStatus(status: number) {
  return status >= 400;
}

function captureTranscript({
  requestUrl,
  requestPayload,
  exchange,
}: {
  requestUrl: string;
  requestPayload: unknown;
  exchange: {
    response: {
      status: number;
      body: unknown;
      bodyText: string | null;
      redactedHeaders: Record<string, string>;
    };
    request: {
      redactedHeaders: Record<string, string>;
    };
  };
}): ChatRunnerTurnTranscript {
  return {
    requestUrl,
    requestPayload,
    requestHeaders: exchange.request.redactedHeaders,
    responseStatus: exchange.response.status,
    responseBody: exchange.response.body,
    responseBodyText: exchange.response.bodyText,
    responseHeaders: exchange.response.redactedHeaders,
    journeySummary: extractJourneySummary(exchange.response.body),
  };
}

function buildRedactedChatRequestHeaders(client: DogfoodHttpClient) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-medora-site': client.site,
  };

  if (client.cookieJar.getRedactedCookies().length > 0) {
    headers.cookie = '<redacted>';
  }

  return headers;
}

export async function runChatSession({
  client,
  bootstrap,
  scenario,
  turns,
  requestTimeoutMs,
}: RunChatSessionOptions): Promise<ChatRunnerResult> {
  requireAllowedBootstrap(bootstrap);
  seedBootstrapCookies(client, bootstrap);

  const transcripts: ChatRunnerTurnTranscript[] = [];
  let stoppedEarly = false;

  for (const turn of turns) {
    const requestPayload = {
      sessionId: bootstrap.widgetChatTargetSessionId,
      message: turn.message,
      ...(turn.attachments ? { attachments: turn.attachments } : {}),
      ...(turn.pageContext ? { pageContext: turn.pageContext } : {}),
    };

    try {
      const exchange = await client.request({
        method: 'POST',
        path: '/api/v3/chatbot/chat',
        body: requestPayload,
        ...(requestTimeoutMs !== undefined ? { timeoutMs: requestTimeoutMs } : {}),
      });

      transcripts.push(captureTranscript({
        requestUrl: exchange.url,
        requestPayload,
        exchange,
      }));

      if (isHardFailureStatus(exchange.response.status) && scenario.retryPolicy === 'stop_on_hard_failure') {
        stoppedEarly = true;
        break;
      }
    } catch (error) {
      const responseText =
        error instanceof Error ? error.message : `Request failed: ${String(error)}`;
      transcripts.push({
        requestUrl: new URL('/api/v3/chatbot/chat', `${client.baseUrl}/`).toString(),
        requestPayload,
        requestHeaders: buildRedactedChatRequestHeaders(client),
        responseStatus: 0,
        responseBody: responseText,
        responseBodyText: responseText,
        responseHeaders: {},
        journeySummary: null,
      });

      if (scenario.retryPolicy === 'stop_on_hard_failure') {
        stoppedEarly = true;
        break;
      }
    }
  }

  return {
    scenarioId: scenario.id,
    stoppedEarly,
    bootstrapMode: bootstrap.bootstrapMode,
    turns: transcripts,
  };
}
