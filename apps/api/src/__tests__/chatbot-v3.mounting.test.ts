import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';

const NOW = new Date('2026-04-15T00:00:00.000Z');
const SESSION_SECRET = 'secret-v3-1';
const SESSION_SECRET_HASH = createHash('sha256').update(SESSION_SECRET).digest('hex');
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

const mockServices = {
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    patchStatus: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
  },
  registerHospitalUser: {
    execute: vi.fn(),
  },
  validateRegistrationToken: {
    execute: vi.fn(),
  },
  createTicket: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (c: { json: (body: unknown, status: number) => Response }) =>
    c.json({ error: 'Missing or invalid Authorization header' }, 401),
}));

describe('Chatbot v3 public route mounting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatSessionRepo.patchStatus.mockImplementation(async (_sessionId: string, patch: Record<string, unknown>) => ({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: patch['formStatus'] ?? 'not_started',
        docUploadStatus: patch['docUploadStatus'] ?? 'submitted',
        recommendationStatus: 'not_started',
        consultationStatus: patch['consultationStatus'] ?? 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: patch['handoffStatus'] ?? 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
    mockServices.createTicket.execute.mockResolvedValue({ id: 'ticket-v3-1' });
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('keeps POST /api/v3/chatbot/chat public and returns v3-only fields', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : undefined;

    expect(res.status).toBe(200);
    expect(body.nextAction).toBeUndefined();
    expect(body.turnOutcome).toBeDefined();
    expect(chatbotV3ChatResponseSchema.parse(body)).toBeDefined();
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledOnce();
  });

  it('returns runtimeDebug with request traceId in non-production', async () => {
    process.env.NODE_ENV = 'test';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace-nonprod-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug).toMatchObject({
      traceId: 'trace-nonprod-1',
      idempotencyKey: expect.any(String),
    });
  });

  it('falls back to generated traceId when x-request-id is invalid', async () => {
    process.env.NODE_ENV = 'test';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace invalid $$$',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug.traceId).not.toBe('trace invalid $$$');
    expect(body.runtimeDebug.traceId).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(body.runtimeDebug.traceId.length).toBeLessThanOrEqual(128);
  });

  it('does not expose runtimeDebug in production responses', async () => {
    process.env.NODE_ENV = 'production';
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-request-id': 'trace-prod-1',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runtimeDebug).toBeUndefined();
  });

  it('returns 404 when the session does not exist', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'missing-session',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(404);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('bootstraps a new session secret cookie when the stored hash is missing', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('chatbot_session_secret=');
    expect(mockServices.aiChatSessionRepo.save).toHaveBeenCalledOnce();
  });

  it('rejects missing or wrong secret on sessions with a stored hash', async () => {
    const { default: app } = await import('../index.js');

    const missingSecret = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const wrongSecret = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=wrong-secret',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(missingSecret.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('rejects patient-linked sessions with missing secret hash instead of bootstrapping', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(mockServices.aiChatSessionRepo.save).not.toHaveBeenCalled();
  });

  it('rejects mismatched patient_session ownership with 403 for patient-linked sessions', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-2' });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `patient_session=patient-token; chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    expect(res.status).toBe(403);
    expect(mockServices.idempotencyExecutor.execute).not.toHaveBeenCalled();
  });

  it('reuses the same explicit idempotency header for concurrent and repeated retries', async () => {
    const observedKeys: string[] = [];
    let releaseConcurrentTurn: (() => void) | null = null;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseConcurrentTurn = resolve;
    });
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockServices.idempotencyExecutor.execute.mockImplementation(async (key: string, _operation: string, fn: () => Promise<unknown>) => {
      observedKeys.push(key);

      if (observedKeys.length === 1) {
        await waitForRelease;
      }

      return fn();
    });

    const { default: app } = await import('../index.js');
    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'retry-key-v3-1',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    } as const;

    const first = app.request('/api/v3/chatbot/chat', request);
    const second = app.request('/api/v3/chatbot/chat', request);

    await Promise.resolve();
    releaseConcurrentTurn?.();

    const [firstRes, secondRes] = await Promise.all([first, second]);
    const thirdRes = await app.request('/api/v3/chatbot/chat', request);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(thirdRes.status).toBe(200);
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledTimes(2);
    expect(new Set(observedKeys)).toHaveProperty('size', 1);
    expect(observedKeys[0]).toContain('session-v3-1:retry-key-v3-1:chatbot-v3-turn');
    expect(observedKeys[0]).toContain(':chatbot-v3-turn');
  });

  it('supports attachment turns through the records upload path', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: null,
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'in_progress',
        docUploadStatus: 'requested',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: '',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storageKey: 'chatbot/session-v3-1/report.pdf',
        }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.patchStatus).toHaveBeenCalled();
  });

  it('does not create duplicate handoff tickets when handoff is already active', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue({
      id: 'db-session-v3-1',
      sessionId: 'session-v3-1',
      sessionSecretHash: SESSION_SECRET_HASH,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'requested',
        riskLevel: 'crisis',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { default: app } = await import('../index.js');
    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}; patient_session=patient-token`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Need a human now',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.handoff.required).toBe(true);
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
  });
});
