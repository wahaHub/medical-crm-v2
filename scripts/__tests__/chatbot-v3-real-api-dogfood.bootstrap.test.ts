import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapRealApiSession } from '../chatbot-v3-real-api-dogfood/bootstrap.ts';
import { createDogfoodHttpClient } from '../chatbot-v3-real-api-dogfood/http-client.ts';

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

test('missing required onboarding payload fields for the allowed path fail loudly', async () => {
  let fetchCalls = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      fetchCalls += 1;
      return makeResponse({});
    },
  });

  await assert.rejects(
    () =>
      bootstrapRealApiSession({
        client,
        scenarioId: 'allowed_after_patient_session',
        bootstrapMode: 'chat_allowed',
        onboardingPayload: {
          email: 'new@example.com',
          destination: 'Shenzhen',
        } as any,
        timestamp: '2026-04-18T14-05-09Z',
      }),
    (error: any) => {
      assert.match(error.message, /name/i);
      return true;
    },
  );
  assert.equal(fetchCalls, 0);
});

test('onboarding success captures patient_session, patient_restore, and widgetChatTarget.sessionId', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return makeResponse({
        jsonBody: {
          patientId: 'patient-1',
          caseId: 'case-1',
          widgetChatTarget: {
            kind: 'CHATBOT_SESSION',
            sessionId: 'widget-chat:patient-1:case-1',
          },
        },
        setCookies: [
          'patient_session=session-cookie-123; Path=/; HttpOnly',
          'patient_restore=restore-cookie-123; Path=/; HttpOnly',
        ],
      });
    },
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, 'https://crm.example.com/api/patient/onboarding/init');
  assert.equal(fetchCalls[0]?.init?.method, 'POST');
  assert.equal(fetchCalls[0]?.init?.body, JSON.stringify({
    email: 'new@example.com',
    name: 'New User',
    preferredLanguage: 'en',
    destination: 'Shenzhen',
  }));
  const requestHeaders = fetchCalls[0]?.init?.headers as Headers;
  assert.equal(requestHeaders.get('content-type'), 'application/json');
  assert.equal(requestHeaders.get('x-medora-site'), 'beauty');
  assert.ok(fetchCalls[0]?.init?.signal instanceof AbortSignal);
  assert.equal(result.bootstrapMode, 'chat_allowed');
  assert.equal(result.patientSession, 'session-cookie-123');
  assert.equal(result.patientRestore, 'restore-cookie-123');
  assert.equal(result.widgetChatTargetSessionId, 'widget-chat:patient-1:case-1');
  assert.deepEqual(result.redactedCookies, [
    'patient_restore=REDACTED',
    'patient_session=REDACTED',
  ]);
});

test('blocked-path setup without allowed bootstrap evidence is classified as blocked, not bootstrap success', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        jsonBody: {
          patientId: 'patient-1',
          caseId: 'case-1',
          nextStep: 'select-hospitals',
        },
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'blocked_without_prereq',
    bootstrapMode: 'blocked_expected',
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(result.bootstrapMode, 'blocked_expected');
  assert.equal(result.patientSession, null);
  assert.equal(result.patientRestore, null);
  assert.equal(result.widgetChatTargetSessionId, null);
});

test('blocked-path HTTP 400 is classified as expected gating for the canonical negative control', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 400,
        jsonBody: {
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: [
            {
              code: 'invalid_type',
              expected: 'string',
              received: 'undefined',
              path: ['name'],
              message: 'Required',
            },
          ],
        },
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'blocked_without_prereq',
    bootstrapMode: 'blocked_expected',
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(result.bootstrapMode, 'blocked_expected');
  assert.equal(result.patientSession, null);
  assert.equal(result.patientRestore, null);
  assert.equal(result.widgetChatTargetSessionId, null);
});

test('blocked-path generic HTTP 400 remains a bootstrap failure', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 400,
        jsonBody: {
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: [
            {
              code: 'invalid_type',
              expected: 'string',
              received: 'undefined',
              path: ['destination'],
              message: 'Required',
            },
          ],
        },
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'blocked_without_prereq',
    bootstrapMode: 'blocked_expected',
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'http_status');
  assert.equal(result.status, 400);
});

test('blocked-path unexpected 5xx statuses are bootstrap failures, not blocked success', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 502,
        textBody: 'bad gateway',
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'blocked_without_prereq',
    bootstrapMode: 'blocked_expected',
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'http_status');
  assert.equal(result.status, 502);
});

test('allowed-path non-200 statuses are preserved as bootstrap failures', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () =>
      makeResponse({
        status: 429,
        textBody: 'rate limited',
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'http_status');
  assert.equal(result.status, 429);
});

test('bootstrap timeout is retried once and records both attempts', async () => {
  let abortsObserved = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async (_url, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }

        signal.addEventListener('abort', () => {
          abortsObserved += 1;
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        });
      }),
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    timeoutMs: 1,
    maxAttempts: 2,
  });

  assert.equal(abortsObserved, 2);
  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'timeout');
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(
    result.attempts.map(({ phase, turnIndex, attempt, transportErrorKind, retried }) => ({
      phase,
      turnIndex,
      attempt,
      transportErrorKind,
      retried,
    })),
    [
      { phase: 'bootstrap', turnIndex: null, attempt: 1, transportErrorKind: 'timeout', retried: true },
      { phase: 'bootstrap', turnIndex: null, attempt: 2, transportErrorKind: 'timeout', retried: false },
    ],
  );
  assert.ok(result.attempts.every((attempt) => attempt.durationMs >= 0));
});

test('bootstrap fetch failed is retried once and recorded as transport bootstrap evidence', async () => {
  let fetchCalls = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new TypeError('fetch failed');
    },
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    maxAttempts: 2,
  });

  assert.equal(fetchCalls, 2);
  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'transport_error');
  assert.deepEqual(
    result.attempts.map(({ phase, turnIndex, attempt, transportErrorKind, retried }) => ({
      phase,
      turnIndex,
      attempt,
      transportErrorKind,
      retried,
    })),
    [
      { phase: 'bootstrap', turnIndex: null, attempt: 1, transportErrorKind: 'transport_error', retried: true },
      { phase: 'bootstrap', turnIndex: null, attempt: 2, transportErrorKind: 'transport_error', retried: false },
    ],
  );
});

test('bootstrap HTTP 400 and 429 responses are not retried and record status attempts', async () => {
  const makeClient = (status: 400 | 429) => {
    let fetchCalls = 0;
    const client = createDogfoodHttpClient({
      baseUrl: 'https://crm.example.com',
      site: 'beauty',
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeResponse({ status, textBody: `HTTP ${status}` });
      },
    });

    return { client, getFetchCalls: () => fetchCalls };
  };

  for (const status of [400, 429] as const) {
    const { client, getFetchCalls } = makeClient(status);
    const result = await bootstrapRealApiSession({
      client,
      scenarioId: 'allowed_after_patient_session',
      bootstrapMode: 'chat_allowed',
      onboardingPayload: {
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
      },
      timestamp: '2026-04-18T14-05-09Z',
      maxAttempts: 2,
    });

    assert.equal(getFetchCalls(), 1);
    assert.equal(result.bootstrapMode, 'bootstrap_failed');
    assert.equal(result.failureKind, 'http_status');
    assert.equal(result.status, status);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0]?.status, status);
    assert.equal(result.attempts[0]?.retried, false);
  }
});

test('HTTP 200 missing patient_session records one status attempt as missing allowed evidence', async () => {
  let fetchCalls = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      fetchCalls += 1;
      return makeResponse({
        jsonBody: {
          widgetChatTarget: { kind: 'CHATBOT_SESSION', sessionId: 'widget-chat:patient-1:case-1' },
        },
        setCookies: ['patient_restore=restore-cookie-123; Path=/; HttpOnly'],
      });
    },
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    maxAttempts: 2,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'missing_allowed_evidence');
  assert.equal(result.status, 200);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]?.status, 200);
  assert.equal(result.attempts[0]?.retried, false);
});

test('HTTP 200 missing patient_restore records one status attempt as missing allowed evidence', async () => {
  let fetchCalls = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      fetchCalls += 1;
      return makeResponse({
        jsonBody: {
          widgetChatTarget: { kind: 'CHATBOT_SESSION', sessionId: 'widget-chat:patient-1:case-1' },
        },
        setCookies: ['patient_session=session-cookie-123; Path=/; HttpOnly'],
      });
    },
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    maxAttempts: 2,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'missing_allowed_evidence');
  assert.equal(result.status, 200);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]?.status, 200);
  assert.equal(result.attempts[0]?.retried, false);
});

test('HTTP 200 missing widgetChatTarget.sessionId records one status attempt as missing allowed evidence', async () => {
  let fetchCalls = 0;
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      fetchCalls += 1;
      return makeResponse({
        jsonBody: {
          widgetChatTarget: { kind: 'CHATBOT_SESSION' },
        },
        setCookies: [
          'patient_session=session-cookie-123; Path=/; HttpOnly',
          'patient_restore=restore-cookie-123; Path=/; HttpOnly',
        ],
      });
    },
  });

  const result = await bootstrapRealApiSession({
    client,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    maxAttempts: 2,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(result.bootstrapMode, 'bootstrap_failed');
  assert.equal(result.failureKind, 'missing_allowed_evidence');
  assert.equal(result.status, 200);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]?.status, 200);
  assert.equal(result.attempts[0]?.retried, false);
});

test('401 and 403 during bootstrap are preserved as bootstrap failures', async () => {
  const makeClient = (status: 401 | 403) =>
    createDogfoodHttpClient({
      baseUrl: 'https://crm.example.com',
      site: 'beauty',
      fetchImpl: async () =>
        makeResponse({
          status,
          jsonBody: { error: 'denied' },
        }),
    });

  const unauthorized = await bootstrapRealApiSession({
    client: makeClient(401),
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
  });

  const forbidden = await bootstrapRealApiSession({
    client: makeClient(403),
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(unauthorized.bootstrapMode, 'bootstrap_failed');
  assert.equal(unauthorized.failureKind, 'http_status');
  assert.equal(unauthorized.status, 401);
  assert.equal(forbidden.bootstrapMode, 'bootstrap_failed');
  assert.equal(forbidden.failureKind, 'http_status');
  assert.equal(forbidden.status, 403);
});

test('timeout and transport errors are surfaced as hard infrastructure-visible failures', async () => {
  let abortObserved = false;
  const timeoutClient = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async (_url, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }

        signal.addEventListener('abort', () => {
          abortObserved = true;
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        });
      }),
  });
  const transportClient = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });

  const timeoutResult = await bootstrapRealApiSession({
    client: timeoutClient,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
    timeoutMs: 1,
  });

  const transportResult = await bootstrapRealApiSession({
    client: transportClient,
    scenarioId: 'allowed_after_patient_session',
    bootstrapMode: 'chat_allowed',
    onboardingPayload: {
      email: 'new@example.com',
      name: 'New User',
      preferredLanguage: 'en',
      destination: 'Shenzhen',
    },
    timestamp: '2026-04-18T14-05-09Z',
  });

  assert.equal(timeoutResult.bootstrapMode, 'bootstrap_failed');
  assert.equal(timeoutResult.failureKind, 'timeout');
  assert.match(timeoutResult.message, /timeout/i);
  assert.equal(abortObserved, true);
  assert.equal(transportResult.bootstrapMode, 'bootstrap_failed');
  assert.equal(transportResult.failureKind, 'transport_error');
  assert.match(transportResult.message, /fetch failed/i);
});

test('caller-supplied cookie headers are rejected explicitly', async () => {
  const client = createDogfoodHttpClient({
    baseUrl: 'https://crm.example.com',
    site: 'beauty',
    fetchImpl: async () => makeResponse({}),
  });

  await assert.rejects(
    () =>
      client.request({
        path: '/api/patient/onboarding/init',
        method: 'POST',
        headers: {
          cookie: 'manual-cookie=1',
        },
        body: { email: 'new@example.com' },
      }),
    (error: any) => {
      assert.match(error.message, /cookie header/i);
      return true;
    },
  );
});
