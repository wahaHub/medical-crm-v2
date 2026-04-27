import assert from 'node:assert/strict';
import test from 'node:test';

import { runChatSession } from '../chatbot-v3-real-api-dogfood/chat-runner.ts';
import {
  CookieJar,
  createDogfoodHttpClient,
  type DogfoodHttpClient,
  type DogfoodHttpExchange,
  type DogfoodHttpRequestOptions,
  DogfoodHttpTransportError,
} from '../chatbot-v3-real-api-dogfood/http-client.ts';
import type { BootstrapSuccessResult } from '../chatbot-v3-real-api-dogfood/bootstrap.ts';

function makeResponse({
  status = 200,
  jsonBody = {},
  textBody,
  setCookies = [],
  headers = {},
}: {
  status?: number;
  jsonBody?: unknown;
  textBody?: string;
  setCookies?: string[];
  headers?: Record<string, string>;
}) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', textBody !== undefined ? 'text/plain; charset=utf-8' : 'application/json');
  }
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', cookie);
  }
  (responseHeaders as Headers & { getSetCookie?: () => string[] }).getSetCookie = () => setCookies;

  return {
    status,
    headers: responseHeaders,
    async text() {
      if (textBody !== undefined) {
        return textBody;
      }

      return JSON.stringify(jsonBody);
    },
  };
}

function makeBootstrapResult(overrides: Partial<BootstrapSuccessResult> = {}): BootstrapSuccessResult {
  return {
    scenarioId: 'allowed_after_patient_session',
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    timestamp: '2026-04-18T14-05-09Z',
    bootstrapMode: 'chat_allowed',
    patientSession: 'session-cookie-123',
    patientRestore: 'restore-cookie-123',
    widgetChatTargetSessionId: 'widget-chat-session-123',
    redactedCookies: ['patient_restore=REDACTED', 'patient_session=REDACTED'],
    attempts: [],
    ...overrides,
  };
}

function makeExchange({
  status = 200,
  body = {
    messages: [{ role: 'assistant', text: 'ok' }],
    turnOutcome: { status: 'ok', recoverableErrorCode: null },
    cards: [],
    journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
    handoff: { required: false, ticketId: null },
  },
  bodyText = JSON.stringify(body),
}: {
  status?: number;
  body?: unknown;
  bodyText?: string | null;
} = {}): DogfoodHttpExchange {
  return {
    url: 'https://crm.example.com/api/v3/chatbot/chat',
    request: {
      method: 'POST',
      path: '/api/v3/chatbot/chat',
      headers: {
        'content-type': 'application/json',
        cookie: 'patient_session=session-cookie-123; patient_restore=restore-cookie-123',
        'x-medora-site': 'beauty',
      },
      redactedHeaders: {
        'content-type': 'application/json',
        cookie: '<redacted>',
        'x-medora-site': 'beauty',
      },
      body: null,
    },
    response: {
      status,
      headers: {},
      redactedHeaders: {},
      body,
      bodyText,
      setCookieHeaders: [],
    },
  };
}

function makeFakeClient(
  request: (options: DogfoodHttpRequestOptions) => Promise<DogfoodHttpExchange>,
): DogfoodHttpClient {
  return {
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    cookieJar: new CookieJar(),
    request,
  };
}

test('turns are sent sequentially to /api/v3/chatbot/chat', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return makeResponse({
        jsonBody: {
          messages: [{ role: 'assistant', text: 'ok' }],
          turnOutcome: { status: 'ok', recoverableErrorCode: null },
          cards: [],
          journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          handoff: { required: false, ticketId: null },
        },
      });
    },
  });

  await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'intake_to_triage_opening',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'Hello' }, { message: 'Please continue' }],
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]?.url, 'https://crm.example.com/api/v3/chatbot/chat');
  assert.equal(fetchCalls[1]?.url, 'https://crm.example.com/api/v3/chatbot/chat');
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    sessionId: 'widget-chat-session-123',
    message: 'Hello',
  });
  assert.deepEqual(JSON.parse(String(fetchCalls[1]?.init?.body)), {
    sessionId: 'widget-chat-session-123',
    message: 'Please continue',
  });
});

test('cookies from bootstrap flow into chat turns', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return makeResponse({
        jsonBody: {
          messages: [{ role: 'assistant', text: 'ok' }],
          turnOutcome: { status: 'ok', recoverableErrorCode: null },
          cards: [],
          journey: { stage: 'COLLECT_MINIMAL_MEDICAL_FACTS', phase: 'active' },
          handoff: { required: false, ticketId: null },
        },
      });
    },
  });

  const bootstrap = makeBootstrapResult();

  await runChatSession({
    client,
    bootstrap,
    scenario: {
      id: 'allowed_after_patient_session',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'Hello' }],
  });

  const requestHeaders = fetchCalls[0]?.init?.headers as Headers;
  assert.ok(requestHeaders.get('cookie')?.includes('patient_session=session-cookie-123'));
  assert.ok(requestHeaders.get('cookie')?.includes('patient_restore=restore-cookie-123'));
  assert.equal(requestHeaders.get('x-medora-site'), 'beauty');
});

test('turn transcript stores request payload, response status, response body, selected headers, and journey summary fields', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 200,
        jsonBody: {
          messages: [{ role: 'assistant', text: 'Welcome' }],
          turnOutcome: { status: 'ok', recoverableErrorCode: null },
          cards: [],
          journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          handoff: { required: false, ticketId: null },
        },
        headers: {
          'x-request-id': 'req-123',
        },
      }),
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'triage_to_recommendation',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'Tell me what to do next' }],
  });

  assert.equal(result.turns.length, 1);
  assert.deepEqual(result.turns[0]?.requestPayload, {
    sessionId: 'widget-chat-session-123',
    message: 'Tell me what to do next',
  });
  assert.equal(result.turns[0]?.responseStatus, 200);
  assert.deepEqual(result.turns[0]?.responseBody, {
    messages: [{ role: 'assistant', text: 'Welcome' }],
    turnOutcome: { status: 'ok', recoverableErrorCode: null },
    cards: [],
    journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
    handoff: { required: false, ticketId: null },
  });
  assert.equal(result.turns[0]?.responseHeaders['x-request-id'], 'req-123');
  assert.deepEqual(result.turns[0]?.journeySummary, {
    stage: 'COLLECT_MEDICAL_INPUTS',
    phase: 'active',
  });
});

test('non-JSON bodies are preserved as text', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 202,
        textBody: 'temporary gateway body',
        headers: {
          'retry-after': '60',
        },
      }),
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'faq_detour_no_progression',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'Show me a FAQ' }],
  });

  assert.equal(result.turns[0]?.responseBodyText, 'temporary gateway body');
  assert.equal(result.turns[0]?.responseBody, 'temporary gateway body');
  assert.equal(result.turns[0]?.responseHeaders['retry-after'], '60');
});

test('failure transcripts capture the client-assembled redacted request headers', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      throw new Error('socket hang up');
    },
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'triage_to_recommendation',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'First' }],
  });

  assert.equal(result.turns.length, 1);
  assert.deepEqual(result.turns[0]?.requestHeaders, {
    'content-type': 'application/json',
    cookie: '<redacted>',
    'x-medora-site': 'beauty',
  });
  assert.equal(result.turns[0]?.responseStatus, 0);
  assert.match(String(result.turns[0]?.responseBodyText), /socket hang up/i);
});

test('runner stops early on non-retryable hard failures unless the scenario explicitly allows retry', async () => {
  let stoppedFetchCalls = 0;
  const stoppedClient = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      stoppedFetchCalls += 1;
      return makeResponse({
        status: 502,
        textBody: 'bad gateway',
      });
    },
  });

  const stopped = await runChatSession({
    client: stoppedClient,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'triage_to_recommendation',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'First' }, { message: 'Second' }],
  });

  assert.equal(stopped.stoppedEarly, true);
  assert.equal(stopped.turns.length, 1);
  assert.equal(stoppedFetchCalls, 1);
  assert.equal(stopped.turns[0]?.responseStatus, 502);

  let retryFetchCalls = 0;
  const retryingClient = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      retryFetchCalls += 1;
      return retryFetchCalls === 1
        ? makeResponse({
            status: 502,
            textBody: 'bad gateway',
          })
        : makeResponse({
            status: 200,
            jsonBody: {
              messages: [{ role: 'assistant', text: 'Recovered' }],
              turnOutcome: { status: 'ok', recoverableErrorCode: null },
              cards: [],
              journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
              handoff: { required: false, ticketId: null },
            },
          });
    },
  });

  const retried = await runChatSession({
    client: retryingClient,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'degraded_then_retry',
      retryPolicy: 'allow_retry_after_hard_failure',
    },
    turns: [{ message: 'First' }, { message: 'Second' }],
  });

  assert.equal(retried.stoppedEarly, false);
  assert.equal(retried.turns.length, 2);
  assert.equal(retryFetchCalls, 2);
  assert.equal(retried.turns[0]?.responseStatus, 502);
  assert.equal(retried.turns[1]?.responseStatus, 200);
});

test('default chat request timeout is 60000ms', async () => {
  const requestOptions: DogfoodHttpRequestOptions[] = [];
  const client = makeFakeClient(async (options) => {
    requestOptions.push(options);
    return makeExchange();
  });

  await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'default_chat_timeout',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'Hello' }],
  });

  assert.equal(requestOptions[0]?.timeoutMs, 60_000);
});

test('chat timeout records a transport attempt and stops early', async () => {
  const client = makeFakeClient(async () => {
    throw new DogfoodHttpTransportError(
      'timeout',
      'Request to https://crm.example.com/api/v3/chatbot/chat timeout after 60000ms',
    );
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'timeout_stops_early',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'First' }],
  });

  assert.equal(result.stoppedEarly, true);
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0]?.responseStatus, 0);
  assert.equal(result.chatAttempts.length, 1);
  assert.deepEqual(
    {
      phase: result.chatAttempts[0]?.phase,
      turnIndex: result.chatAttempts[0]?.turnIndex,
      attempt: result.chatAttempts[0]?.attempt,
      transportErrorKind: result.chatAttempts[0]?.transportErrorKind,
      status: result.chatAttempts[0]?.status,
      retried: result.chatAttempts[0]?.retried,
    },
    {
      phase: 'chat',
      turnIndex: 0,
      attempt: 1,
      transportErrorKind: 'timeout',
      status: undefined,
      retried: false,
    },
  );
});

test('chat HTTP 500 records status in attempt without transport failure metadata', async () => {
  let calls = 0;
  const client = makeFakeClient(async () => {
    calls += 1;
    return makeExchange({
      status: 500,
      body: { error: 'runtime failed' },
      bodyText: JSON.stringify({ error: 'runtime failed' }),
    });
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'http_500_status',
      retryPolicy: 'stop_on_hard_failure',
      transportRetryPolicy: 'retry_once_if_safe',
    },
    turns: [{ message: 'First' }],
  });

  assert.equal(calls, 1);
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.turns[0]?.responseStatus, 500);
  assert.equal(result.chatAttempts.length, 1);
  assert.equal(result.chatAttempts[0]?.status, 500);
  assert.equal(result.chatAttempts[0]?.transportErrorKind, undefined);
  assert.equal(result.chatAttempts[0]?.errorMessage, undefined);
});

test('safe retry scenarios can retry one same-turn transport error, but default scenarios do not retry', async () => {
  let defaultCalls = 0;
  const defaultClient = makeFakeClient(async () => {
    defaultCalls += 1;
    throw new DogfoodHttpTransportError('transport_error', 'Request failed: fetch failed');
  });

  const defaultResult = await runChatSession({
    client: defaultClient,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'default_no_transport_retry',
      retryPolicy: 'stop_on_hard_failure',
    },
    turns: [{ message: 'First' }],
  });

  assert.equal(defaultCalls, 1);
  assert.equal(defaultResult.turns.length, 1);
  assert.equal(defaultResult.chatAttempts.length, 1);
  assert.equal(defaultResult.chatAttempts[0]?.retried, false);

  let safeCalls = 0;
  const safeClient = makeFakeClient(async () => {
    safeCalls += 1;
    if (safeCalls === 1) {
      throw new DogfoodHttpTransportError('transport_error', 'Request failed: fetch failed');
    }

    return makeExchange();
  });

  const safeResult = await runChatSession({
    client: safeClient,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'safe_transport_retry',
      retryPolicy: 'stop_on_hard_failure',
      transportRetryPolicy: 'retry_once_if_safe',
    },
    turns: [{ message: 'First' }],
  });

  assert.equal(safeCalls, 2);
  assert.equal(safeResult.stoppedEarly, false);
  assert.equal(safeResult.turns.length, 1);
  assert.equal(safeResult.turns[0]?.responseStatus, 200);
  assert.deepEqual(
    safeResult.chatAttempts.map((attempt) => ({
      turnIndex: attempt.turnIndex,
      attempt: attempt.attempt,
      transportErrorKind: attempt.transportErrorKind,
      status: attempt.status,
      retried: attempt.retried,
    })),
    [
      {
        turnIndex: 0,
        attempt: 1,
        transportErrorKind: 'transport_error',
        status: undefined,
        retried: true,
      },
      {
        turnIndex: 0,
        attempt: 2,
        transportErrorKind: undefined,
        status: 200,
        retried: false,
      },
    ],
  );
});

test('multi-turn chat attempts preserve zero-based turnIndex including second-turn retry', async () => {
  let calls = 0;
  const client = makeFakeClient(async () => {
    calls += 1;
    if (calls === 2) {
      throw new DogfoodHttpTransportError('timeout', 'Request timed out');
    }

    return makeExchange();
  });

  const result = await runChatSession({
    client,
    bootstrap: makeBootstrapResult(),
    scenario: {
      id: 'second_turn_retry_attempt_indexes',
      retryPolicy: 'stop_on_hard_failure',
      transportRetryPolicy: 'retry_once_if_safe',
    },
    turns: [{ message: 'First' }, { message: 'Second' }],
  });

  assert.equal(result.stoppedEarly, false);
  assert.equal(result.turns.length, 2);
  assert.deepEqual(
    result.chatAttempts.map((attempt) => ({
      turnIndex: attempt.turnIndex,
      attempt: attempt.attempt,
      status: attempt.status,
      transportErrorKind: attempt.transportErrorKind,
      retried: attempt.retried,
    })),
    [
      { turnIndex: 0, attempt: 1, status: 200, transportErrorKind: undefined, retried: false },
      { turnIndex: 1, attempt: 1, status: undefined, transportErrorKind: 'timeout', retried: true },
      { turnIndex: 1, attempt: 2, status: 200, transportErrorKind: undefined, retried: false },
    ],
  );
});
