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
    createGuestRestoreArtifacts: vi.fn(),
  },
  mediaUpload: {
    createUploadIntent: vi.fn(),
  },
  storage: {
    getSignedUrls: vi.fn(),
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
    mockServices.patientAuthService.createGuestRestoreArtifacts.mockResolvedValue({
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
    });
    mockServices.storage.getSignedUrls.mockResolvedValue({});
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
        nextAction: 'REQUEST_DOC_UPLOAD',
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
    expect(json.nextAction).toBe('REQUEST_DOC_UPLOAD');
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
        nextAction: 'REQUEST_DOC_UPLOAD',
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

  it('POST /api/v2/chatbot/chat accepts pageContext, stores it on the user message, and forwards it to Dify inputs', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-page-context',
      answer: JSON.stringify({
        answer: 'Here is how this hospital handles review.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        topic: 'DOCUMENTS',
        nextAction: 'ANSWER_FAQ',
        responseMode: 'grounded_answer',
        reasonCodes: ['faq_answer'],
        shortlist: [],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Can this hospital review my rhinoplasty case?',
        pageContext: {
          type: 'HOSPITAL_DETAIL',
          hospitalId: 'hospital-123',
          hospitalName: 'Medora Seoul',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
    );
    const createdUserMessage = mockServices.aiChatMessageRepo.create.mock.calls[0]?.[0];
    expect(createdUserMessage).toMatchObject({
      role: 'USER',
      metadata: {
        pageContext: {
          type: 'HOSPITAL_DETAIL',
          hospitalId: 'hospital-123',
          hospitalName: 'Medora Seoul',
        },
      },
    });
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({
          pageContextJson: JSON.stringify({
            type: 'HOSPITAL_DETAIL',
            hospitalId: 'hospital-123',
            hospitalName: 'Medora Seoul',
          }),
          pageContext: {
            type: 'HOSPITAL_DETAIL',
            hospitalId: 'hospital-123',
            hospitalName: 'Medora Seoul',
          },
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat accepts attachment-only input and persists attachment refs on the user message', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-attachments',
      answer: JSON.stringify({
        answer: 'Thanks, I reviewed the upload context.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        topic: 'DOCUMENTS',
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_answer',
        reasonCodes: ['document_uploaded'],
        shortlist: [],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: '',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          storageKey: 'crm/dev/chatbot/report.pdf',
        }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: 'USER',
        content: '',
        metadata: {
          attachments: [{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }],
        },
      }),
    );
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Uploaded attachments',
        inputs: expect.objectContaining({
          attachmentsJson: JSON.stringify([{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }]),
          attachments: [{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }],
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat serializes blocks on the wire for action-driven responses', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-123',
      answer: JSON.stringify({
        answer: 'Here is how the process usually works.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
        responseMode: 'grounded_answer',
        reasonCodes: ['process_overview_requested'],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'What do you need from me before you can recommend hospitals?',
      }),
    });

    expect(res.status).toBe(200);
    const rawJson = await res.json();
    expect(rawJson).toMatchObject({
      blocks: [
        expect.objectContaining({
          type: 'PROCESS_MODAL_TRIGGER',
          modalKey: 'MEDICAL_TRAVEL_PROCESS',
        }),
      ],
    });

    const json = chatbotChatResponseSchema.parse(rawJson);
    expect(json.nextAction).toBe('EXPLAIN_MEDICAL_TRAVEL_PROCESS');
    expect(json.blocks).toEqual([
      expect.objectContaining({
        type: 'PROCESS_MODAL_TRIGGER',
        modalKey: 'MEDICAL_TRAVEL_PROCESS',
      }),
    ]);
  });

  it('POST /api/v2/chatbot/chat normalizes legacy public nextAction values before schema validation', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-legacy-next-action',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOCS',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['documents_required_before_recommendation'],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-legacy-next-action',
        hospitalType: 'COSMETIC',
        message: 'What do you need before recommending hospitals?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: 'REQUEST_DOCS',
      }),
    );
  });

  it('POST /api/v2/chatbot/chat normalizes legacy consult nextAction values into the public contract', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-unsafe-legacy',
      answer: JSON.stringify({
        answer: 'We will connect you with our team.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'CONSULT_CONVERSION',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['conversion_requested'],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-unsafe-legacy',
        hospitalType: 'COSMETIC',
        message: 'I want to start a case now.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('INVITE_ONLINE_CONSULT');
  });

  it('POST /api/v2/chatbot/chat normalizes legacy metadata nextAction fields in the public response only', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-public-metadata',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['documents_required_before_recommendation'],
        metadata: {
          nextAction: 'REQUEST_DOCS',
          publicNextAction: 'REQUEST_DOCS',
          next_action: 'REQUEST_DOCS',
          public_next_action: 'REQUEST_DOCS',
          structuredOutput: {
            nextAction: 'REQUEST_DOCS',
            publicNextAction: 'REQUEST_DOCS',
            next_action: 'REQUEST_DOCS',
            public_next_action: 'REQUEST_DOCS',
          },
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-public-metadata',
        hospitalType: 'COSMETIC',
        message: 'What do you need before recommending hospitals?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(json.metadata.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(json.metadata.publicNextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(json.metadata.next_action).toBe('REQUEST_DOC_UPLOAD');
    expect(json.metadata.public_next_action).toBe('REQUEST_DOC_UPLOAD');
    expect((json.metadata.structuredOutput as Record<string, unknown>).nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(((json.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>).publicNextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it('POST /api/v2/chatbot/chat persists raw assistant metadata while keeping public nextAction normalized', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-persist-raw',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOCS',
        responseMode: 'grounded_plus_guidance',
        metadata: {
          nextAction: 'REQUEST_DOCS',
          publicNextAction: 'REQUEST_DOCS',
          structuredOutput: {
            nextAction: 'REQUEST_DOCS',
            publicNextAction: 'REQUEST_DOCS',
          },
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-persist-raw',
        hospitalType: 'COSMETIC',
        message: 'What do you need before recommending hospitals?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          nextAction: 'REQUEST_DOCS',
          publicNextAction: 'REQUEST_DOCS',
          structuredOutput: expect.objectContaining({
            nextAction: 'REQUEST_DOCS',
            metadata: expect.objectContaining({
              nextAction: 'REQUEST_DOCS',
              publicNextAction: 'REQUEST_DOCS',
            }),
          }),
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat builds hospital recommendation cards for restored widget sessions without prior workflow messages', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-restored-shortlist',
      answer: JSON.stringify({
        answer: 'Here are some hospital options.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        responseMode: 'grounded_plus_guidance',
        shortlist: [
          {
            hospitalId: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Ruijin Hospital',
            reason: 'Strong fit for this case',
          },
        ],
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'COSMETIC',
        message: 'Can you recommend hospitals for me?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.blocks).toEqual([
      expect.objectContaining({
        type: 'HOSPITAL_RECOMMENDATION_CARDS',
        caseId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ]);
  });

  it('POST /api/v2/chatbot/chat rejects invalid pageContext payloads', async () => {
    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'hello',
        pageContext: {
          type: 'HOSPITAL_DETAIL',
        },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
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
        nextAction: 'SAFETY_HANDOFF',
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

  it('POST /api/v2/chatbot/chat deeply sanitizes nested structuredOutput metadata before returning it publicly', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-nested',
      message_id: 'provider-msg-nested',
      task_id: 'provider-task-nested',
      answer: JSON.stringify({
        answer: 'Here is a safe explanation of our process.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
        responseMode: 'light_discovery_guidance',
        metadata: {
          rawResponse: { secret: true },
          conversation_id: 'nested-conversation-id',
          message_id: 'nested-message-id',
          nested: {
            raw_response: { secret: 'nested' },
            task_id: 'nested-task-id',
          },
        },
        collectedFields: {
          metadata: {
            rawResponse: 'should-not-survive',
            conversation_id: 'collected-conversation-id',
          },
        },
      }),
      metadata: {
        retriever_resources: [],
        rawResponse: { requestId: 'provider-request' },
        nested: {
          conversation_id: 'provider-conversation-id',
          message_id: 'provider-message-id',
        },
      },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-nested',
        hospitalType: 'COSMETIC',
        message: 'Just explain the process.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.metadata.rawResponse).toBeUndefined();
    expect(json.metadata.message_id).toBeUndefined();
    const structuredOutput = (json.metadata as Record<string, unknown>).structuredOutput as Record<string, unknown>;
    expect(structuredOutput).toMatchObject({
      answer: 'Here is a safe explanation of our process.',
      metadata: {
        nested: {},
      },
      collectedFields: {
        metadata: {},
      },
    });
    expect((structuredOutput.metadata as Record<string, unknown>).rawResponse).toBeUndefined();
    expect((structuredOutput.metadata as Record<string, unknown>).conversation_id).toBeUndefined();
    expect((structuredOutput.metadata as Record<string, unknown>).message_id).toBeUndefined();
    expect(((structuredOutput.metadata as Record<string, unknown>).nested as Record<string, unknown>).raw_response).toBeUndefined();
    expect(((structuredOutput.metadata as Record<string, unknown>).nested as Record<string, unknown>).task_id).toBeUndefined();
    expect((((structuredOutput.collectedFields as Record<string, unknown>).metadata) as Record<string, unknown>).rawResponse).toBeUndefined();
    expect((((structuredOutput.collectedFields as Record<string, unknown>).metadata) as Record<string, unknown>).conversation_id).toBeUndefined();
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
        nextAction: 'ANSWER_FAQ',
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
    expect(json.nextAction).toBe('ANSWER_FAQ');
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
        nextAction: 'EXPLAIN_CONSULT_PROCESS',
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
    expect(json.nextAction).toBe('EXPLAIN_CONSULT_PROCESS');
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
        nextAction: 'REQUEST_DOC_UPLOAD',
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
    expect(json.nextAction).toBe('REQUEST_DOC_UPLOAD');
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
      statusSnapshot: {
        conversationSummary: null,
        pendingOffer: null,
        pendingQuestion: null,
      },
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

  it('POST /api/v2/chatbot/chat reuses the stored hospitalType when an existing session omits it', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        selectedHospitalId: null,
        consultationStatus: 'not_introduced',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        leadMaturity: 'browsing',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        prequalificationReasonCodes: [],
        enteredDeepWorkflowAt: null,
        pendingOffer: null,
        pendingQuestion: null,
        lastNextAction: null,
        lastResolvedIntent: null,
        conversationSummary: '',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
    }));
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'conv-123',
      answer: 'Continuing the same session.',
      metadata: {
        structuredOutput: {
          intent: 'FAQ',
          topic: 'consultation',
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'ANSWER_FAQ',
          citations: [],
          collectedFields: {},
          missingItems: [],
          recommendedProviders: [],
          reasonCodes: [],
          shortlist: [],
        },
      },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        message: 'Continue our conversation.',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({
          hospitalType: 'COSMETIC',
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat builds consult booking cards from merged collected fields across session history', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
      patientId: 'patient-1',
      statusSnapshot: {
        consultationStatus: 'ready',
      },
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'assistant-old-1',
        role: 'ASSISTANT',
        metadata: {
          structuredOutput: {
            collectedFields: {
              name: 'Hao Wang',
              email: 'hao@example.com',
              country: 'China',
              conditionSummary: 'Need a treatment plan for persistent eye pain.',
            },
          },
        },
      }),
    ]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-consult',
      answer: JSON.stringify({
        answer: 'We can move to an online consultation next.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'INVITE_ONLINE_CONSULT',
        responseMode: 'deep_workflow_progression',
        collectedFields: {
          budget: 'Flexible',
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'COSMETIC',
        message: 'Okay, let’s book the online consultation.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.nextAction).toBe('INVITE_ONLINE_CONSULT');
    expect(json.blocks).toEqual([
      expect.objectContaining({
        type: 'ONLINE_CONSULT_BOOKING_CARD',
        consultationStatus: 'ready',
        conversionDraft: expect.objectContaining({
          sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
          name: 'Hao Wang',
          email: 'hao@example.com',
          country: 'China',
          conditionSummary: 'Need a treatment plan for persistent eye pain.',
          budget: 'Flexible',
        }),
      }),
    ]);
  });

  it('POST /api/v2/chatbot/chat prefers newer historical collected fields over older values when building consult cards', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
      patientId: 'patient-1',
      statusSnapshot: {
        consultationStatus: 'ready',
      },
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'assistant-newer-1',
        role: 'ASSISTANT',
        metadata: {
          structuredOutput: {
            collectedFields: {
              email: 'new-email@example.com',
              country: 'Singapore',
            },
          },
        },
      }),
      makeMessage({
        id: 'assistant-older-1',
        role: 'ASSISTANT',
        metadata: {
          structuredOutput: {
            collectedFields: {
              name: 'Hao Wang',
              email: 'old-email@example.com',
              country: 'China',
              conditionSummary: 'Need a treatment plan for persistent eye pain.',
            },
          },
        },
      }),
    ]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-consult-freshness',
      answer: JSON.stringify({
        answer: 'We can move to an online consultation next.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'INVITE_ONLINE_CONSULT',
        responseMode: 'deep_workflow_progression',
        collectedFields: {
          budget: 'Flexible',
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'COSMETIC',
        message: 'Okay, let’s book the online consultation.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.blocks).toEqual([
      expect.objectContaining({
        type: 'ONLINE_CONSULT_BOOKING_CARD',
        conversionDraft: expect.objectContaining({
          email: 'new-email@example.com',
          country: 'Singapore',
          name: 'Hao Wang',
          conditionSummary: 'Need a treatment plan for persistent eye pain.',
          budget: 'Flexible',
        }),
      }),
    ]);
  });

  it('POST /api/v2/chatbot/chat tolerates a stale patient session cookie when the chatbot secret is still valid', async () => {
    const secretHash = createHash('sha256').update('secret-current').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
      patientId: 'patient-1',
      sessionSecretHash: secretHash,
      hospitalType: 'REGULAR',
      statusSnapshot: {
        consultationStatus: 'ready',
      },
    }));
    mockServices.patientAuthService.verifySessionToken.mockRejectedValue(new Error('expired'));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-valid-secret',
      answer: JSON.stringify({
        answer: 'We can still continue here.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
        responseMode: 'grounded_answer',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-current; patient_session=expired-patient-cookie',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        message: 'Hello again',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledOnce();
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
    expect(mockServices.aiChatMessageRepo.deleteById).not.toHaveBeenCalled();
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          draftState: 'provider_error',
          failureStage: 'provider_request',
        }),
      }),
    );
    const failurePatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls[0]?.[1];
    expect(failurePatch.writebackStatus).toBeUndefined();
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

  it('POST /api/v2/chatbot/uploads/init allows a provisioned widget session with a valid patient session cookie', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
      uploadUrl: 'https://upload.example.com',
      storageKey: 'chatbot/file.pdf',
      expiresIn: 900,
      asset: {
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'chatbot/file.pdf',
      },
    });

    const res = await app.request('/api/v2/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
  });

  it('POST /api/v2/chatbot/uploads/init rejects a provisioned widget session without a matching patient session cookie', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
    }));

    const res = await app.request('/api/v2/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/uploads/init prefers a matching patient session over a stale chatbot secret for widget sessions', async () => {
    const currentSecretHash = createHash('sha256').update('secret-current').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: currentSecretHash,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
      uploadUrl: 'https://upload.example.com',
      storageKey: 'chatbot/file.pdf',
      expiresIn: 900,
      asset: {
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'chatbot/file.pdf',
      },
    });

    const res = await app.request('/api/v2/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-stale; patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1');
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
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

  it('GET /api/v2/chatbot/history/{sessionId} allows a provisioned widget session with a valid patient session cookie', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);

    const res = await app.request('/api/v2/chatbot/history/widget-chat:patient-1:case-1?limit=2', {
      method: 'GET',
      headers: {
        Cookie: 'patient_session=patient-cookie-1',
      },
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatMessageRepo.listBySession).toHaveBeenCalledWith('db-session-1', 2);
  });

  it('GET /api/v2/chatbot/history/{sessionId} rejects a provisioned widget session without a matching patient session cookie', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
    }));

    const res = await app.request('/api/v2/chatbot/history/widget-chat:patient-1:case-1?limit=2', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    expect(mockServices.aiChatMessageRepo.listBySession).not.toHaveBeenCalled();
  });

  it('GET /api/v2/chatbot/history/{sessionId} prefers a matching patient session over a stale chatbot secret for widget sessions', async () => {
    const staleSecretHash = createHash('sha256').update('secret-current').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: staleSecretHash,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);

    const res = await app.request('/api/v2/chatbot/history/widget-chat:patient-1:case-1?limit=2', {
      method: 'GET',
      headers: {
        Cookie: 'chatbot_session_secret=secret-stale; patient_session=patient-cookie-1',
      },
    });

    expect(res.status).toBe(200);
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1');
    expect(mockServices.aiChatMessageRepo.listBySession).toHaveBeenCalledWith('db-session-1', 2);
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

  it('GET /api/v2/chatbot/history/{sessionId} returns signed attachment objects for chatbot user messages', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-user',
        role: 'USER',
        content: '',
        metadata: {
          attachments: [{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }],
        },
        createdAt: new Date('2026-03-26T09:00:00.000Z'),
      }),
    ]);
    mockServices.storage.getSignedUrls.mockResolvedValue({
      'crm/dev/chatbot/report.pdf': 'https://signed.example.com/report.pdf',
    });

    const res = await app.request('/api/v2/chatbot/history/session-1?limit=2', {
      method: 'GET',
      headers: {
        Cookie: 'chatbot_session_secret=secret-123',
      },
    });

    expect(res.status).toBe(200);
    const json = chatbotHistoryResponseSchema.parse(await res.json());
    expect(json.messages[0]?.attachments).toEqual([{
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storageKey: 'crm/dev/chatbot/report.pdf',
      name: 'report.pdf',
      type: 'application/pdf',
      size: 1024,
      url: 'https://signed.example.com/report.pdf',
    }]);
    expect(mockServices.storage.getSignedUrls).toHaveBeenCalledWith(['crm/dev/chatbot/report.pdf']);
  });

  it('GET /api/v2/chatbot/history/{sessionId} replays stored rich blocks for assistant messages', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-assistant',
        role: 'ASSISTANT',
        content: 'Here is how the process works.',
        metadata: {
          blocks: [{
            id: 'process-modal-1',
            type: 'PROCESS_MODAL_TRIGGER',
            modalKey: 'MEDICAL_TRAVEL_PROCESS',
            title: 'How the process works',
            description: 'See the overall medical travel journey.',
            ctaLabel: 'Open process guide',
          }],
        },
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
    expect(json.messages[0]?.blocks).toEqual([
      expect.objectContaining({
        type: 'PROCESS_MODAL_TRIGGER',
        modalKey: 'MEDICAL_TRAVEL_PROCESS',
      }),
    ]);
  });

  it('GET /api/v2/chatbot/history/{sessionId} normalizes legacy workflow nextAction values before public serialization', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeEscalationMessage({
        createdAt: new Date('2026-03-26T09:10:00.000Z'),
      }),
      makeMessage({
        id: 'msg-old',
        role: 'USER',
        content: 'Please help',
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
    expect(json.messages[1]?.nextAction).toBe('HUMAN_HANDOFF');
  });

  it('GET /api/v2/chatbot/history/{sessionId} normalizes legacy metadata nextAction fields before public serialization', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-legacy-metadata',
        role: 'ASSISTANT',
        content: 'Please upload your reports first.',
        nextAction: 'REQUEST_DOCS',
        metadata: {
          publicNextAction: 'REQUEST_DOCS',
          structuredOutput: {
            nextAction: 'REQUEST_DOCS',
            metadata: {
              publicNextAction: 'REQUEST_DOCS',
            },
          },
        },
        createdAt: new Date('2026-03-26T09:10:00.000Z'),
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
    expect(json.messages[0]?.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(json.messages[0]?.metadata.publicNextAction).toBe('REQUEST_DOC_UPLOAD');
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>).publicNextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it('GET /api/v2/chatbot/history/{sessionId} normalizes legacy workflow requestedAction fields in public metadata', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-legacy-workflow-action',
        role: 'ASSISTANT',
        content: 'We can help you request an online consultation.',
        nextAction: 'CONSULT_CONVERSION',
        metadata: {
          workflow: {
            kind: 'CONVERT',
            requestedAction: 'CONSULT_CONVERSION',
          },
        },
        createdAt: new Date('2026-03-26T09:10:00.000Z'),
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
    expect(json.messages[0]?.nextAction).toBe('INVITE_ONLINE_CONSULT');
    expect(((json.messages[0]?.metadata.workflow) as Record<string, unknown>).requestedAction).toBe('INVITE_ONLINE_CONSULT');
  });

  it('GET /api/v2/chatbot/history/{sessionId} hides provider-failed assistant drafts', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-failed-draft',
        role: 'ASSISTANT',
        content: '',
        createdAt: new Date('2026-03-26T09:06:00.000Z'),
        metadata: {
          draftState: 'provider_error',
          failureStage: 'provider_request',
        },
      }),
      makeMessage({
        id: 'msg-answer',
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

    const res = await app.request('/api/v2/chatbot/history/session-1?limit=3', {
      method: 'GET',
      headers: {
        Cookie: 'chatbot_session_secret=secret-123',
      },
    });

    expect(res.status).toBe(200);
    const json = chatbotHistoryResponseSchema.parse(await res.json());
    expect(json.messages.map((message) => message.id)).toEqual(['msg-old', 'msg-answer']);
    expect(json.messages.every((message) => message.metadata.draftState !== 'provider_error')).toBe(true);
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
        requestedAction: 'INVITE_ONLINE_CONSULT',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.caseId).toBe('case-1');
    expect(json.patientId).toBe('patient-1');
    expect(json.restoreToken).toBe('restore-token-123');
    expect(json.alreadyExists).toBe(true);
    expect(json.requestedAction).toBe('INVITE_ONLINE_CONSULT');
    expect(mockServices.initOnboarding.execute).not.toHaveBeenCalled();
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-123');
  });

  it('POST /api/v2/chatbot/convert rotates patient cookies when the browser still has a different patient session', async () => {
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
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-other',
      role: 'PATIENT',
      exp: 9999999999,
    });

    const res = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123; patient_session=wrong-patient-session; patient_restore=old-restore-cookie',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'INVITE_ONLINE_CONSULT',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.restoreToken).toBe('restore-token-123');
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('wrong-patient-session');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
    expect(res.headers.get('set-cookie')).toContain('patient_session=patient-token');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-123');
  });

  it('POST /api/v2/chatbot/convert prefers existing workflow ownership over a mismatched patient session cookie when session.patientId is null', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: null,
    }));
    mockServices.aiChatSessionRepo.attachPatient.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'workflow-msg-legacy-convert',
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
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-other',
      role: 'PATIENT',
      exp: 9999999999,
    });

    const res = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123; patient_session=wrong-patient-session',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'INVITE_ONLINE_CONSULT',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.patientId).toBe('patient-1');
    expect(json.caseId).toBe('case-1');
    expect(json.alreadyExists).toBe(true);
    expect(json.requestedAction).toBe('INVITE_ONLINE_CONSULT');
    expect(mockServices.aiChatSessionRepo.attachPatient).toHaveBeenCalledWith('session-1', 'patient-1');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
    expect(res.headers.get('set-cookie')).toContain('patient_session=patient-token');
  });

  it('POST /api/v2/chatbot/convert passes authenticatedPatientId to onboarding for a logged-in patient starting a first case', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-logged-in',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-logged-in',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.initOnboarding.execute.mockResolvedValue({
      patientId: 'patient-logged-in',
      caseId: 'case-new',
      token: 'patient-token-logged-in',
      restoreToken: 'restore-token-logged-in',
      restoreCookie: 'restore-cookie-logged-in',
      isExistingPatient: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-logged-in:case-new',
      },
      nextStep: 'select-hospitals',
    });
    mockServices.caseRepo.findById.mockResolvedValue({
      id: 'case-new',
      patientId: 'patient-logged-in',
      patientName: null,
      patientCountry: null,
      conditionSummary: null,
      structuredData: {},
    });

    const res = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123; patient_session=patient-session-logged-in',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'INVITE_ONLINE_CONSULT',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.initOnboarding.execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alice@example.com',
      authenticatedPatientId: 'patient-logged-in',
    }));
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.requestedAction).toBe('INVITE_ONLINE_CONSULT');
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
      restoreToken: 'restore-token-123',
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
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
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
      restoreToken: 'restore-token-123',
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

  it('POST /api/v2/chatbot/escalate prefers existing workflow ownership over a mismatched patient session cookie when session.patientId is null', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: null,
      status: 'ESCALATED',
    }));
    mockServices.aiChatSessionRepo.attachPatient.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
      status: 'ESCALATED',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeEscalationMessage({
        metadata: {
          workflow: {
            kind: 'ESCALATE',
            patientId: 'patient-1',
            caseId: 'case-1',
            ticketId: 'ticket-1',
          },
        },
      }),
    ]);
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-other',
      role: 'PATIENT',
      exp: 9999999999,
    });

    const res = await app.request('/api/v2/chatbot/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123; patient_session=wrong-patient-session',
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
    expect(json.patientId).toBe('patient-1');
    expect(json.caseId).toBe('case-1');
    expect(json.ticketId).toBe('ticket-1');
    expect(json.alreadyExists).toBe(true);
    expect(mockServices.aiChatSessionRepo.attachPatient).toHaveBeenCalledWith('session-1', 'patient-1');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
    expect(res.headers.get('set-cookie')).toContain('patient_session=patient-token');
  });

  it('POST /api/v2/chatbot/escalate passes authenticatedPatientId to onboarding when the logged-in patient starts the first escalation flow', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-logged-in',
      status: 'ACTIVE',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-logged-in',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.initOnboarding.execute.mockResolvedValue({
      patientId: 'patient-logged-in',
      caseId: 'case-esc',
      token: 'patient-token-esc',
      restoreToken: 'restore-token-esc',
      restoreCookie: 'restore-cookie-esc',
      isExistingPatient: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-logged-in:case-esc',
      },
      nextStep: 'select-hospitals',
    });
    mockServices.caseRepo.findById.mockResolvedValue({
      id: 'case-esc',
      patientId: 'patient-logged-in',
      patientName: null,
      patientCountry: null,
      conditionSummary: null,
      structuredData: {},
    });
    mockServices.createTicket.execute.mockResolvedValue({ id: 'ticket-esc' });
    mockServices.aiChatSessionRepo.updateStatus.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      status: 'ESCALATED',
      patientId: 'patient-logged-in',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);

    const res = await app.request('/api/v2/chatbot/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-123; patient_session=patient-session-logged-in',
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
    expect(mockServices.initOnboarding.execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alice@example.com',
      authenticatedPatientId: 'patient-logged-in',
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
      restoreToken: 'restore-token-123',
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
