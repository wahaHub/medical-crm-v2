import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  chatbotChatResponseSchema,
  chatbotConvertResponseSchema,
  chatbotEscalateResponseSchema,
  chatbotHistoryResponseSchema,
} from '@medical-crm/validation';
import chatbotRoutes from '../routes/chatbot.routes.js';

const mockServices = {
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    attachPatient: vi.fn(),
    updateStatus: vi.fn(),
  },
  aiChatMessageRepo: {
    create: vi.fn(),
    updateMessage: vi.fn(),
    deleteById: vi.fn(),
    listBySession: vi.fn(),
  },
  difyApi: {
    createChatMessage: vi.fn(),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
    createSessionToken: vi.fn(),
  },
  mediaUpload: {
    createUploadIntent: vi.fn(),
  },
  initOnboarding: {
    execute: vi.fn(),
  },
  caseRepo: {
    findById: vi.fn(),
    save: vi.fn(),
  },
  createTicket: {
    execute: vi.fn(),
  },
  bootstrapAiSync: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

const app = new OpenAPIHono();
let currentSession = {
  userId: 'admin-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};
app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});
app.route('/', chatbotRoutes);

const NOW = new Date('2026-03-26T10:00:00.000Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-session-1',
    sessionId: 'session-1',
    sessionSecretHash: null,
    difyConversationId: null,
    patientId: null,
    hospitalType: 'COSMETIC',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    sessionId: 'db-session-1',
    role: 'ASSISTANT',
    content: 'ok',
    intent: null,
    riskLevel: null,
    canAnswer: null,
    nextAction: null,
    secondaryAction: null,
    responseMode: null,
    citations: [],
    reasonCodes: [],
    shortlist: [],
    metadata: {},
    createdAt: NOW,
    ...overrides,
  };
}

function makeEscalationMessage(overrides: Record<string, unknown> = {}) {
  return makeMessage({
    id: 'workflow-msg-esc',
    role: 'SYSTEM',
    content: 'Chatbot conversation escalated to support.',
    nextAction: 'ESCALATE',
    metadata: {
      workflow: {
        kind: 'ESCALATE',
        patientId: 'patient-1',
        caseId: 'case-1',
        ticketId: 'ticket-1',
      },
    },
    ...overrides,
  });
}

describe('Chatbot routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DIFY_API_KEY'] = 'test-dify-key';
    currentSession = {
      userId: 'admin-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.create.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.updateMessage.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      id,
      sessionId: 'db-session-1',
      role: 'ASSISTANT',
      content: patch.content ?? '',
      intent: patch.intent ?? null,
      resolvedIntent: patch.resolvedIntent ?? null,
      riskLevel: patch.riskLevel ?? null,
      canAnswer: patch.canAnswer ?? null,
      nextAction: patch.nextAction ?? null,
      secondaryAction: patch.secondaryAction ?? null,
      responseMode: patch.responseMode ?? null,
      citations: patch.citations ?? [],
      reasonCodes: patch.reasonCodes ?? [],
      shortlist: patch.shortlist ?? [],
      metadata: patch.metadata ?? {},
      createdAt: NOW,
      writebackStatus: 'pending',
      toolTrace: [],
    }));
    mockServices.aiChatMessageRepo.deleteById.mockResolvedValue(true);
    mockServices.patientAuthService.createSessionToken.mockResolvedValue('patient-token');
  });

  it('POST /api/v2/chatbot/chat returns normalized structured response without exposing dify conversation id', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-123',
      answer: JSON.stringify({
        answer: 'We can help you with that.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        topic: 'PROCEDURE',
        nextAction: 'CONSULT_CONVERSION',
        secondaryAction: 'REQUEST_DOCS',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['consult_interest_detected'],
        shortlist: [{ hospitalId: 'hospital-1', matchType: 'matched', reasonCodes: ['goal_fit'] }],
        collectedFields: { country: 'Singapore' },
        missingItems: ['photo'],
        citations: [{ sourceTitle: 'FAQ', snippet: 'Sample snippet' }],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.sessionId).toBe('session-1');
    expect(json.intent).toBe('CONSULT');
    expect((json as Record<string, unknown>)['topic']).toBe('PROCEDURE');
    expect(json.nextAction).toBe('CONSULT_CONVERSION');
    expect(json.secondaryAction).toBe('REQUEST_DOCS');
    expect((json as Record<string, unknown>)['responseMode']).toBe('grounded_plus_guidance');
    expect(json.reasonCodes).toEqual(['consult_interest_detected']);
    expect(json.shortlist).toEqual([{ hospitalId: 'hospital-1', matchType: 'matched', reasonCodes: ['goal_fit'] }]);
    expect(json.collectedFields?.country).toBe('Singapore');
    expect(json.missingItems).toEqual(['photo']);
    expect(json.metadata).toMatchObject({
      structuredOutput: expect.objectContaining({
        topic: 'PROCEDURE',
      }),
    });
    expect(json.metadata.rawResponse).toBeUndefined();
    expect('difyConversationId' in (json as Record<string, unknown>)).toBe(false);
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'session-1',
        conversationId: null,
        inputs: expect.objectContaining({
          hospitalType: 'COSMETIC',
          sessionId: 'session-1',
          assistantMessageId: expect.any(String),
          currentStatus: expect.any(Object),
        }),
      }),
    );
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: expect.any(String),
        role: 'ASSISTANT',
        content: '',
      }),
    );
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'CONSULT',
        nextAction: 'CONSULT_CONVERSION',
        secondaryAction: 'REQUEST_DOCS',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['consult_interest_detected'],
        shortlist: [{ hospitalId: 'hospital-1', matchType: 'matched', reasonCodes: ['goal_fit'] }],
        metadata: expect.objectContaining({
          topic: 'PROCEDURE',
        }),
      }),
    );
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls[0]?.[0];
    const assistantDraft = mockServices.aiChatMessageRepo.create.mock.calls[1]?.[0];
    expect(assistantDraft.id).toBe(difyPayload.inputs.assistantMessageId);
    expect(mockServices.aiChatMessageRepo.create.mock.invocationCallOrder[1]).toBeLessThan(
      mockServices.difyApi.createChatMessage.mock.invocationCallOrder[0]!,
    );
  });

  it('POST /api/v2/chatbot/chat maps HIGH_RISK into a safe public risk level without leaking raw upstream payloads', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-risk',
      message_id: 'provider-msg-1',
      task_id: 'provider-task-1',
      answer: JSON.stringify({
        answer: 'You should seek urgent support right now.',
        intent: 'SAFETY',
        riskLevel: 'HIGH_RISK',
        canAnswer: true,
        nextAction: 'SAFETY',
        responseMode: 'safety_only',
        metadata: {
          conversation_id: 'should-not-leak',
        },
      }),
      metadata: {
        retriever_resources: [],
        message_id: 'provider-msg-1',
      },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-risk',
        hospitalType: 'COSMETIC',
        message: 'I feel unsafe and need help now.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.riskLevel).toBe('CRISIS');
    expect(json.metadata).toMatchObject({
      internalRiskLevel: 'HIGH_RISK',
    });
    expect(json.metadata.rawResponse).toBeUndefined();
    expect(json.metadata.conversation_id).toBeUndefined();
    expect(json.metadata.message_id).toBeUndefined();
  });

  it('POST /api/v2/chatbot/chat preserves light-discovery routing details without promoting a deep action', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-light',
      answer: JSON.stringify({
        answer: 'We can help explain what we do and how the process works.',
        intent: 'FAQ',
        resolvedIntent: 'GENERAL_CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER',
        secondaryAction: null,
        responseMode: 'light_discovery_guidance',
        engagementMode: 'LIGHT_DISCOVERY',
        metadata: {
          internalNextAction: 'ANSWER_FAQ',
        },
        reasonCodes: ['light_discovery_soft_guidance'],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-light',
        hospitalType: 'COSMETIC',
        message: 'Hi, what do you do?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('ANSWER');
    expect(json.responseMode).toBe('light_discovery_guidance');
    expect(json.metadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      internalNextAction: 'ANSWER_FAQ',
    });
  });

  it('POST /api/v2/chatbot/chat preserves qualified-exploration detail while keeping the public contract compatible', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-qualified',
      answer: JSON.stringify({
        answer: 'I can walk you through how consultation and hospital matching usually work before you decide.',
        intent: 'CONSULT',
        resolvedIntent: 'GENERAL_CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER',
        secondaryAction: null,
        responseMode: 'consult_explanation',
        engagementMode: 'QUALIFIED_EXPLORATION',
        metadata: {
          internalNextAction: 'EXPLAIN_CONSULT_PROCESS',
        },
        reasonCodes: ['qualified_consult_explanation'],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-qualified',
        hospitalType: 'COSMETIC',
        message: 'Can you explain how you choose hospitals before I decide?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('ANSWER');
    expect(json.responseMode).toBe('consult_explanation');
    expect(json.metadata).toMatchObject({
      engagementMode: 'QUALIFIED_EXPLORATION',
      internalNextAction: 'EXPLAIN_CONSULT_PROCESS',
    });
  });

  it('POST /api/v2/chatbot/chat keeps explicit progression requests on deep workflow signals', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-deep',
      answer: JSON.stringify({
        answer: 'We can start a full case workflow now.',
        intent: 'CONSULT',
        resolvedIntent: 'START_CASE',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'CREATE_CASE',
        secondaryAction: 'REQUEST_DOCS',
        responseMode: 'deep_workflow_progression',
        engagementMode: 'DEEP_WORKFLOW',
        metadata: {
          internalNextAction: 'CREATE_CASE',
        },
        reasonCodes: ['explicit_progression_request'],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-deep',
        hospitalType: 'COSMETIC',
        message: 'I want to start now and create a case.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('CREATE_CASE');
    expect(json.secondaryAction).toBe('REQUEST_DOCS');
    expect(json.responseMode).toBe('deep_workflow_progression');
    expect(json.metadata).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      internalNextAction: 'CREATE_CASE',
    });
  });

  it('POST /api/v2/chatbot/chat returns 409 when an existing session is reused with a mismatched hospitalType', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      hospitalType: 'COSMETIC',
    }));

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'REGULAR',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(409);
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/chat returns 502 when the Dify client throws', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockRejectedValue(new Error('upstream unavailable'));

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'I want to consult about rhinoplasty.',
      }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream unavailable' });
    expect(mockServices.aiChatMessageRepo.deleteById).toHaveBeenCalledWith(expect.any(String));
  });

  it('POST /api/v2/chatbot/uploads/init rejects access without matching chatbot session secret', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));

    const res = await app.request('/api/v2/chatbot/uploads/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('GET /api/v2/chatbot/history/{sessionId} returns 401 without a valid chatbot session secret', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));

    const res = await app.request('/api/v2/chatbot/history/session-1?limit=2', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    expect(mockServices.aiChatMessageRepo.listBySession).not.toHaveBeenCalled();
  });

  it('GET /api/v2/chatbot/history/{sessionId} returns ordered history payload for an authorized session', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    // Repository contract is newest-first (DESC); the route should reverse into chronological order.
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-new',
        role: 'ASSISTANT',
        content: 'Latest answer',
        createdAt: new Date('2026-03-26T09:05:00.000Z'),
      }),
      makeMessage({
        id: 'msg-old',
        role: 'USER',
        content: 'First question',
        createdAt: new Date('2026-03-26T09:00:00.000Z'),
      }),
    ]);

    const res = await app.request('/api/v2/chatbot/history/session-1?limit=2', {
      method: 'GET',
      headers: {
        Cookie: 'chatbot_session_secret=secret-123',
      },
    });

    expect(res.status).toBe(200);
    const json = chatbotHistoryResponseSchema.parse(await res.json());
    expect(json.session).toEqual({
      sessionId: 'session-1',
      hospitalType: 'COSMETIC',
      status: 'ACTIVE',
      patientId: 'patient-1',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(json.messages.map((message) => message.id)).toEqual(['msg-old', 'msg-new']);
    expect(json.messages.map((message) => message.content)).toEqual(['First question', 'Latest answer']);
    expect(mockServices.aiChatMessageRepo.listBySession).toHaveBeenCalledWith('db-session-1', 2);
  });

  it('POST /api/v2/chatbot/convert reuses existing case workflow instead of creating a duplicate case', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'workflow-msg-1',
        role: 'SYSTEM',
        metadata: {
          workflow: {
            kind: 'CONVERT',
            requestedAction: 'CONSULT_CONVERSION',
            patientId: 'patient-1',
            caseId: 'case-1',
          },
        },
      }),
    ]);

    const res = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'CONSULT_CONVERSION',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.caseId).toBe('case-1');
    expect(json.patientId).toBe('patient-1');
    expect(json.alreadyExists).toBe(true);
    expect(mockServices.initOnboarding.execute).not.toHaveBeenCalled();
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
  });

  it('POST /api/v2/chatbot/escalate reuses an existing ticket workflow instead of creating a duplicate ticket', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
      status: 'ESCALATED',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeEscalationMessage(),
    ]);

    const res = await app.request('/api/v2/chatbot/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        reason: 'Need follow-up help',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotEscalateResponseSchema.parse(await res.json());
    expect(json).toEqual({
      sessionId: 'session-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      ticketId: 'ticket-1',
      alreadyExists: true,
    });
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
    expect(mockServices.aiChatSessionRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/escalate creates a ticket and marks the session escalated for a new escalation path', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      status: 'ACTIVE',
    }));
    mockServices.initOnboarding.execute.mockResolvedValue({
      patientId: 'patient-2',
      caseId: 'case-2',
      token: 'patient-token-2',
      isExistingPatient: false,
    });
    mockServices.caseRepo.findById.mockResolvedValue({
      id: 'case-2',
      patientId: 'patient-2',
      patientName: null,
      patientCountry: null,
      conditionSummary: null,
      structuredData: {},
    });
    mockServices.createTicket.execute.mockResolvedValue({
      id: 'ticket-2',
    });
    mockServices.aiChatSessionRepo.updateStatus.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      status: 'ESCALATED',
      patientId: 'patient-2',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);

    const res = await app.request('/api/v2/chatbot/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        reason: 'Need follow-up help',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotEscalateResponseSchema.parse(await res.json());
    expect(json).toEqual({
      sessionId: 'session-1',
      patientId: 'patient-2',
      caseId: 'case-2',
      ticketId: 'ticket-2',
      alreadyExists: false,
    });
    expect(mockServices.createTicket.execute).toHaveBeenCalledOnce();
    expect(mockServices.aiChatSessionRepo.updateStatus).toHaveBeenCalledWith('session-1', 'ESCALATED');
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenCalledOnce();
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'SYSTEM',
      nextAction: 'ESCALATE',
      metadata: expect.objectContaining({
        workflow: expect.objectContaining({
          kind: 'ESCALATE',
          patientId: 'patient-2',
          caseId: 'case-2',
          ticketId: 'ticket-2',
        }),
      }),
    }));
  });

  it('POST /api/v2/chatbot/escalate repairs stale ESCALATED state without creating a duplicate ticket', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
      status: 'ACTIVE',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeEscalationMessage(),
    ]);

    const res = await app.request('/api/v2/chatbot/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotEscalateResponseSchema.parse(await res.json());
    expect(json).toEqual({
      sessionId: 'session-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      ticketId: 'ticket-1',
      alreadyExists: true,
    });
    expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
    expect(mockServices.aiChatSessionRepo.updateStatus).toHaveBeenCalledWith('session-1', 'ESCALATED');
  });

  it('POST /api/v2/chatbot/sync is admin-only and returns the bootstrap enqueue summary', async () => {
    mockServices.bootstrapAiSync.execute.mockResolvedValue({
      faqEnqueued: 12,
      packageEnqueued: 4,
    });

    const res = await app.request('/api/v2/chatbot/sync', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      faqEnqueued: 12,
      packageEnqueued: 4,
    });
    expect(mockServices.bootstrapAiSync.execute).toHaveBeenCalledOnce();
  });

  it('POST /api/v2/chatbot/sync rejects non-admin users', async () => {
    currentSession = {
      userId: 'hospital-1',
      email: 'hospital@test.com',
      roles: ['HOSPITAL'],
      hospitalId: 'hospital-123',
    };

    const res = await app.request('/api/v2/chatbot/sync', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(mockServices.bootstrapAiSync.execute).not.toHaveBeenCalled();
  });
});
