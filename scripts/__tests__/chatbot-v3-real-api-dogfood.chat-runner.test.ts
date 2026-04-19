import assert from 'node:assert/strict';
import test from 'node:test';

import { runChatSession } from '../chatbot-v3-real-api-dogfood/chat-runner.ts';
import { createDogfoodHttpClient } from '../chatbot-v3-real-api-dogfood/http-client.ts';
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
    ...overrides,
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
