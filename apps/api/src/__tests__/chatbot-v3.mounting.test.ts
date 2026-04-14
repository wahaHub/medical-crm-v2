import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';

const NOW = new Date('2026-04-15T00:00:00.000Z');

const mockServices = {
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
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
    vi.clearAllMocks();
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
  });

  it('keeps POST /api/v3/chatbot/chat public and returns v3-only fields', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  it('reuses a deterministic idempotency key for concurrent and repeated identical payloads', async () => {
    const observedKeys: string[] = [];
    let releaseConcurrentTurn: (() => void) | null = null;
    const waitForRelease = new Promise<void>((resolve) => {
      releaseConcurrentTurn = resolve;
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
      headers: { 'Content-Type': 'application/json' },
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
    expect(observedKeys[0]).toContain('session-v3-1:');
    expect(observedKeys[0]).toContain(':chatbot-v3-turn');
  });
});
