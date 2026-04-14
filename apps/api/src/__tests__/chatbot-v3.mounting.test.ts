import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';

const NOW = new Date('2026-04-15T00:00:00.000Z');
const SESSION_SECRET = 'secret-v3-1';
const SESSION_SECRET_HASH = createHash('sha256').update(SESSION_SECRET).digest('hex');

const mockServices = {
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    patchStatus: vi.fn(),
  },
  registerHospitalUser: {
    execute: vi.fn(),
  },
  validateRegistrationToken: {
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
        formStatus: 'not_started',
        docUploadStatus: patch['docUploadStatus'] ?? 'submitted',
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
    }));
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
});
