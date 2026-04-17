import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { AiChatMessage, Conversation } from '@medical-crm/domain';
import {
  chatbotChatResponseSchema,
  chatbotConvertResponseSchema,
  chatbotEscalateResponseSchema,
  chatbotHistoryResponseSchema,
} from '@medical-crm/validation';
import chatbotRoutes from '../routes/chatbot.routes.js';

const { mockBroadcast } = vi.hoisted(() => ({
  mockBroadcast: vi.fn(),
}));
vi.mock('../ws/ws-manager.js', () => ({
  wsManager: { broadcast: mockBroadcast },
}));

const mockServices: any = {
  aiChatSessionRepo: {
    findBySessionId: vi.fn(),
    save: vi.fn(),
    setDifyConversationId: vi.fn(),
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
  conversationRepo: {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
  },
  messageRepo: {
    findById: vi.fn(),
    findByConversationId: vi.fn(),
    findPendingReview: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  createTicket: {
    execute: vi.fn(),
  },
  bootstrapAiSync: {
    execute: vi.fn(),
  },
  getTemplateByDisease: {
    execute: vi.fn(),
  },
  getAiPolicyContext: {
    execute: vi.fn(),
  },
  txRunner: {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
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
const originalAppRequest = app.request.bind(app);
app.request = ((input: string, init?: RequestInit) =>
  originalAppRequest(input, {
    ...init,
    headers: withSiteHeaders(init?.headers),
  })) as typeof app.request;

const NOW = new Date('2026-03-26T10:00:00.000Z');

function withSiteHeaders(headers?: HeadersInit, site = 'beauty') {
  const merged = new Headers(headers);
  if (!merged.has('x-medora-site')) {
    merged.set('x-medora-site', site);
  }
  return merged;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-session-1',
    sessionId: 'session-1',
    site: 'beauty',
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

function expectNoLegacyChatbotUiFields(json: Record<string, unknown>) {
  expect(json.difyConversationId).toBeUndefined();
  expect(json.conversationId).toBeUndefined();
}

describe('Chatbot routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env['DIFY_API_KEY'] = 'test-dify-key';
    mockServices.difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'faq',
          targetResourceTypes: [],
          includeProgressionFollowUp: false,
        }),
      }),
    };
    mockServices.difyFaqGroundingApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          faqScope: 'GENERAL_ONLY',
          categories: ['Consultation Process'],
          groundedContext: 'Grounded FAQ context',
        }),
      }),
    };
    currentSession = {
      userId: 'admin-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatSessionRepo.setDifyConversationId.mockResolvedValue(null);
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
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.patientAuthService.createSessionToken.mockResolvedValue('patient-token');
    mockServices.patientAuthService.createGuestRestoreArtifacts.mockResolvedValue({
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
    });
    mockServices.storage.getSignedUrls.mockResolvedValue({});
    mockServices.conversationRepo.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      hasMore: false,
    });
    mockServices.conversationRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.messageRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.txRunner.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
    mockServices.getTemplateByDisease.execute.mockRejectedValue(new Error('default questionnaire unavailable'));
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        source: 'status_snapshot_bridge',
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'active',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: {
            mode: 'journey',
          },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
      },
    });
  });

  it('POST /api/v2/chatbot/chat returns normalized structured response without exposing dify conversation id', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi = {
      createChatMessage: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          requestClass: 'resource_request',
          targetResourceTypes: ['PROCESS_GUIDE'],
          includeProgressionFollowUp: false,
        }),
      }),
    };
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.sessionId).toBe('session-1');
    expect(json.intent).toBe('CONSULT');
    expect((json as Record<string, unknown>)['topic']).toBe('PROCEDURE');
    expect(json.secondaryAction).toBe('REQUEST_DOCS');
    expect((json as Record<string, unknown>)['responseMode']).toBe('grounded_plus_guidance');
    expect(json.reasonCodes).toEqual(['consult_interest_detected']);
    expect(json.shortlist).toEqual([{ hospitalId: 'hospital-1', matchType: 'matched', reasonCodes: ['goal_fit'] }]);
    expect(json.collectedFields?.country).toBe('Singapore');
    expect(json.missingItems).toEqual(['photo']);
    expect(json.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(json.resources.map((resource) => resource.resourceType)).toEqual(['PROCESS_GUIDE']);
    expect(json.resources.map((resource) => resource.resourceType)).not.toContain('ONLINE_CONSULT_BOOKING');
    expect(json.resources.find((resource) => resource.resourceType === 'PROCESS_GUIDE')?.payload).toMatchObject({
      title: 'How the process works',
      description: 'See the overall medical travel journey.',
      ctaLabel: 'Open process guide',
      modalKey: 'MEDICAL_TRAVEL_PROCESS',
    });
    expect(json.metadata).toMatchObject({
      structuredOutput: expect.objectContaining({
        topic: 'PROCEDURE',
      }),
    });
    expect(json.metadata.rawResponse).toBeUndefined();
    expect('difyConversationId' in (json as Record<string, unknown>)).toBe(false);
    expect(mockServices.difyClassifierApi.createChatMessage).toHaveBeenCalledOnce();
    expect(mockServices.difyClassifierApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      query: 'I want to consult about rhinoplasty.',
      user: 'session-1',
      inputs: {
        recentMessages: JSON.stringify([
          {
            role: 'USER',
            content: 'I want to consult about rhinoplasty.',
          },
        ]),
        conversationSummary: '',
        journeySnapshot: JSON.stringify({
          currentStage: 'EXPLAIN_PROCESS',
          currentPhase: 'active',
        }),
        allowedResourceHints: JSON.stringify([
          {
            resourceType: 'PROCESS_GUIDE',
            description: 'Explains the consultation and treatment process.',
          },
          {
            resourceType: 'MEDICAL_INVITATION_STATUS',
            description: 'Lets the patient check the medical invitation status.',
          },
          {
            resourceType: 'MEDICAL_DOC_UPLOAD',
            description: 'Lets the patient upload medical records and reports.',
          },
          {
            resourceType: 'QUESTIONNAIRE',
            description: 'Lets the patient fill in a medical intake questionnaire.',
          },
          {
            resourceType: 'HOSPITAL_RECOMMENDATION',
            description: 'Lets the patient review or confirm recommended hospitals.',
          },
          {
            resourceType: 'PACKAGE_RECOMMENDATION',
            description: 'Lets the patient review or confirm recommended packages.',
          },
        ]),
      },
    }));
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'session-1',
        conversationId: null,
        inputs: expect.objectContaining({
          hospitalType: 'COSMETIC',
          sessionId: 'session-1',
          assistantMessageId: expect.any(String),
          currentStatus: expect.any(String),
          chatbotV2: expect.any(String),
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
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls[0]?.[1] as Record<string, unknown>;
    const storedChatbotV2 = (storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2 as {
      resources: Array<{ resourceType: string }>;
    };
    const assistantDraft = mockServices.aiChatMessageRepo.create.mock.calls[1]?.[0];
    expect((storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2).toMatchObject({
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      requestClass: 'resource_request',
      responseIntent: 'resource_request',
    });
    expect((storedAssistantPatch.metadata as Record<string, unknown>).classifierResult).toEqual({
      requestClass: 'resource_request',
      targetResourceTypes: ['PROCESS_GUIDE'],
      includeProgressionFollowUp: false,
    });
    expect(assistantDraft.id).toBe(difyPayload.inputs.assistantMessageId);
    expect(mockServices.aiChatMessageRepo.create.mock.invocationCallOrder[1]).toBeLessThan(
      mockServices.difyApi.createChatMessage.mock.invocationCallOrder[0]!,
    );
    expect(json.resources).toEqual(expect.arrayContaining(storedChatbotV2.resources));
  });

  it('POST /api/v2/chatbot/chat mirrors registered widget turns into the admin conversation with explicit AI sender identity', async () => {
    const mirroredConversation = new Conversation({
      id: 'conv-admin-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      title: null,
      hospitalId: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      assistantMode: 'AI_ACTIVE',
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
    });
    mockServices.conversationRepo.findMany.mockResolvedValue({
      data: [mirroredConversation],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasMore: false,
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        answer: 'This is Medora AI, and I can help with that.',
        intent: 'CONSULT',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
      }),
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-token',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        message: 'I want the admin team to see this update.',
        attachments: [{
          fileName: 'report.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          storageKey: 'crm/dev/chatbot/report.pdf',
        }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.messageRepo.save).toHaveBeenCalledTimes(2);

    const mirroredPatientMessage = mockServices.messageRepo.save.mock.calls[0]?.[0];
    expect(mirroredPatientMessage).toMatchObject({
      conversationId: 'conv-admin-1',
      senderId: 'patient-1',
      content: 'I want the admin team to see this update.',
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'crm/dev/chatbot/report.pdf',
      }],
    });

    const mirroredAssistantMessage = mockServices.messageRepo.save.mock.calls[1]?.[0];
    expect(mirroredAssistantMessage).toMatchObject({
      conversationId: 'conv-admin-1',
      senderId: null,
      senderRole: 'AI',
      senderName: 'Medora AI',
      content: 'This is Medora AI, and I can help with that.',
    });

    const savedConversation = mockServices.conversationRepo.save.mock.calls.at(-1)?.[0];
    expect(savedConversation).toMatchObject({
      id: 'conv-admin-1',
      lastMessagePreview: 'This is Medora AI, and I can help with that.',
      lastSenderId: null,
    });
    expect(mockBroadcast).toHaveBeenCalledWith('conv:conv-admin-1', {
      type: 'new_message',
      data: expect.objectContaining({
        conversationId: 'conv-admin-1',
        senderId: 'patient-1',
      }),
    });
    expect(mockBroadcast).toHaveBeenCalledWith('conv:conv-admin-1', {
      type: 'new_message',
      data: expect.objectContaining({
        conversationId: 'conv-admin-1',
        senderRole: 'AI',
      }),
    });
  });

  it('POST /api/v2/chatbot/chat preserves the patient turn but skips Dify when the mirrored conversation is already HUMAN_TAKEOVER', async () => {
    const mirroredConversation = new Conversation({
      id: 'conv-admin-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      title: null,
      hospitalId: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      assistantMode: 'HUMAN_TAKEOVER',
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
    });
    mockServices.conversationRepo.findMany.mockResolvedValue({
      data: [mirroredConversation],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasMore: false,
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-token',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        message: 'Please help me',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.messageRepo.save).toHaveBeenCalledTimes(1);
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.answer).toBe('');
    expect(json.nextAction).toBe('HUMAN_HANDOFF');
  });

  it('POST /api/v2/chatbot/chat fails closed before Dify when mirrored conversation resolution fails', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
    });
    mockServices.conversationRepo.findMany.mockRejectedValue(new Error('resolution failed'));

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-token',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        message: 'Please preserve this turn',
      }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Unable to preserve patient turn in formal conversation' });
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
    expect(mockServices.messageRepo.save).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/chat flips the mirrored conversation to HUMAN_TAKEOVER and emits the handoff notice when Dify requests HUMAN_HANDOFF', async () => {
    const mirroredConversation = new Conversation({
      id: 'conv-admin-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      title: null,
      hospitalId: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      assistantMode: 'AI_ACTIVE',
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
    });
    mockServices.conversationRepo.findMany.mockResolvedValue({
      data: [mirroredConversation],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasMore: false,
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        answer: 'Let me hand this to a human advisor.',
        intent: 'CONSULT',
        canAnswer: false,
        nextAction: 'HUMAN_HANDOFF',
      }),
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-token',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        message: 'I need a human',
      }),
    });

    expect(res.status).toBe(200);
    const savedConversation = mockServices.conversationRepo.save.mock.calls.at(-1)?.[0];
    expect(savedConversation).toMatchObject({
      id: 'conv-admin-1',
      assistantMode: 'HUMAN_TAKEOVER',
    });
    const persistedNotice = mockServices.messageRepo.save.mock.calls.at(-1)?.[0];
    expect(persistedNotice).toMatchObject({
      conversationId: 'conv-admin-1',
      senderRoleOverride: 'SYSTEM',
      messageType: 'SYSTEM',
      content: 'Medora AI 已转人工，现由顾问接手',
    });
    expect(mockBroadcast).toHaveBeenCalledWith('conv:conv-admin-1', {
      type: 'new_message',
      data: expect.objectContaining({
        messageType: 'SYSTEM',
        content: 'Medora AI 已转人工，现由顾问接手',
      }),
    });
  });

  it('POST /api/v2/chatbot/chat keeps the main chatbot response healthy when mirror persistence fails', async () => {
    const mirroredConversation = new Conversation({
      id: 'conv-admin-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      title: null,
      hospitalId: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
    });
    mockServices.conversationRepo.findMany.mockResolvedValue({
      data: [mirroredConversation],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasMore: false,
    });
    mockServices.messageRepo.save.mockRejectedValue(new Error('mirror persist failed'));
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        answer: 'This is Medora AI, and I can help with that.',
        intent: 'CONSULT',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
      }),
    });

    try {
      const res = await app.request('/api/v2/chatbot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'patient_session=patient-token',
        },
        body: JSON.stringify({
          sessionId: 'widget-chat:patient-1:case-1',
          message: 'Mirror should be fail closed.',
        }),
      });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Unable to preserve patient turn in formal conversation' });
      expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        '[chatbot-mirror] failed to preserve patient turn in conversation',
        expect.objectContaining({
          conversationId: 'conv-admin-1',
          error: 'mirror persist failed',
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('POST /api/v2/chatbot/chat rejects missing site context before persisting a new session', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);

    const res = await originalAppRequest('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-no-site',
        hospitalType: 'COSMETIC',
        message: 'hello',
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing or invalid patient site context' });
    expect(mockServices.aiChatSessionRepo.save).not.toHaveBeenCalled();
  });

  it('invokes FAQ grounding before composer for faq turns and passes grounded FAQ context downstream', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      statusSnapshot: {
        conditionStatus: 'unknown',
        formStatus: 'not_started',
        docUploadStatus: 'none',
        recommendationStatus: 'not_started',
        consultationStatus: 'not_started',
        packageStatus: 'not_introduced',
        handoffStatus: 'not_needed',
        riskLevel: 'low',
        trustOrObjection: 'none',
        engagementMode: 'LIGHT_DISCOVERY',
        enteredDeepWorkflowAt: null,
        conversationSummary: 'overview-state',
        lastPolicyDecisionAt: null,
        lastUserMessageAt: null,
        lastAssistantMessageAt: null,
      },
    }));
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        answer: 'Grounded answer',
        nextAction: 'ANSWER_FAQ',
      }),
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'How does your consultation process work?',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.difyFaqGroundingApi.createChatMessage).toHaveBeenCalledOnce();
    expect(mockServices.difyFaqGroundingApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        hospitalType: 'COSMETIC',
        query: 'How does your consultation process work?',
      }),
      query: 'How does your consultation process work?',
      user: 'session-1',
    }));
    expect(mockServices.difyApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        faqGrounding: JSON.stringify({
          faqScope: 'GENERAL_ONLY',
          categories: ['Consultation Process'],
          groundedContext: 'Grounded FAQ context',
        }),
      }),
    }));
  });

  it('POST /api/v2/chatbot/chat keeps CRM-owned chatbotV2 context even when the assistant suggests a later-stage action', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'resource_request',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-journey-123',
      answer: JSON.stringify({
        answer: 'The next step is to review a few hospital recommendations before booking a consultation.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        shortlist: [{ hospitalId: 'hospital-1', matchType: 'matched', reasonCodes: ['goal_fit'] }],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Can I book a consultation now?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const difyChatbotV2 = JSON.parse(((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string)) as {
      journeySnapshot: { currentStage: string; currentPhase: string };
      resources: Array<{ resourceType: string }>;
      requestClass: string;
      responseIntent: string;
      truthSummary?: { medicalInputsSubmitted?: boolean };
    };
    const storedChatbotV2 = (storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
      resources: Array<{ resourceType: string }>;
      requestClass: string;
      responseIntent: string;
    };

    expect(difyChatbotV2.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(difyChatbotV2.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:session-1',
      }),
    ]));
    expect(difyChatbotV2.requestClass).toBe('resource_request');
    expect(difyChatbotV2.responseIntent).toBe('resource_request');
    expect(difyChatbotV2.truthSummary).toMatchObject({
      medicalInputsSubmitted: false,
    });

    expect(json.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(json.resources.map((resource) => resource.resourceType)).toContain('PROCESS_GUIDE');
    expect(json.resources.map((resource) => resource.resourceType)).not.toContain('HOSPITAL_RECOMMENDATION');

    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2.resources.map((resource) => resource.resourceType)).toContain('PROCESS_GUIDE');
    expect(storedChatbotV2.resources.map((resource) => resource.resourceType)).not.toContain('HOSPITAL_RECOMMENDATION');
    expect(storedChatbotV2.requestClass).toBe('resource_request');
    expect(storedChatbotV2.responseIntent).toBe('resource_request');
    expect((storedChatbotV2 as Record<string, unknown>).truthSummary).toMatchObject({
      medicalInputsSubmitted: false,
    });

    expect(json.resources).toEqual(expect.arrayContaining(storedChatbotV2.resources));
    expect(storedChatbotV2).toMatchObject({
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      requestClass: 'resource_request',
      responseIntent: 'resource_request',
      targetResourceTypes: ['PROCESS_GUIDE'],
      resources: expect.arrayContaining([
        expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
      ]),
    });
  });

  it('POST /api/v2/chatbot/chat preserves targeted process resources after same-stage replies', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        source: 'status_snapshot_bridge',
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'COLLECT_MEDICAL_INPUTS',
          current_phase: 'active',
        },
        allowed_resources: [
          {
            resource_type: 'MEDICAL_DOC_UPLOAD',
            resource_id: 'medical-doc-upload:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: {
              mode: 'journey',
            },
            payload: {
              title: 'Upload your records',
            },
            actions: ['open'],
          },
          {
            resource_type: 'QUESTIONNAIRE',
            resource_id: 'questionnaire:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: {
              mode: 'journey',
            },
            payload: {
              title: 'Complete your questionnaire',
            },
            actions: ['open'],
          },
        ],
      },
      status_snapshot: {
        form_status: 'STARTED',
      },
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-process-123',
      answer: JSON.stringify({
        answer: 'First let me walk you through how the process works.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: null,
        secondaryAction: null,
        responseMode: 'grounded_answer',
        reasonCodes: ['process_explained'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Can you explain how the process works?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(json.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:session-1',
      }),
    ]));

    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedChatbotV2 = (storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2 as {
      resources: Array<{ resourceType: string; resourceId: string }>;
    };
    expect(storedChatbotV2.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:session-1',
      }),
    ]));
  });

  it('POST /api/v2/chatbot/chat keeps the pre-turn journey advance when the assistant omits nextAction', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-continue-123',
      answer: JSON.stringify({
        answer: 'We can begin collecting your medical information now.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: null,
        secondaryAction: null,
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['progression_request'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'I am ready to continue. What is the next step?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(json.resources.map((resource) => resource.resourceType)).toEqual([
      'PROCESS_GUIDE',
      'MEDICAL_DOC_UPLOAD',
      'QUESTIONNAIRE',
      'HUMAN_HANDOFF',
      'MEDICAL_INVITATION_STATUS',
    ]);

    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
  });

  it('POST /api/v2/chatbot/chat keeps discovery FAQ in EXPLAIN_PROCESS.pre when starter metadata is still at the invitation gate', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession());
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'active',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
      },
      chatbot_v2_floor: {
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'pre',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
        request_class: 'process_explanation',
        response_intent: 'process_explanation',
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-discovery-pre',
      answer: JSON.stringify({
        answer: 'We coordinate cross-border care planning.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
        responseMode: 'grounded_answer',
        reasonCodes: ['faq_answer'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'What do you help patients with?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const difyChatbotV2 = JSON.parse(((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string));
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };

    expect(difyChatbotV2.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(json.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
  });

  it('POST /api/v2/chatbot/chat treats consent as EXPLAIN_PROCESS.active pre-turn and auto-bridges to COLLECT_MEDICAL_INPUTS.pre', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession());
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'active',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
      },
      chatbot_v2_floor: {
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'pre',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
        request_class: 'process_explanation',
        response_intent: 'process_explanation',
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-consent-bridge',
      answer: JSON.stringify({
        answer: 'Here is the full consultation process and what we will need next.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: null,
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['process_explained'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Okay, explain the process.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const difyChatbotV2 = JSON.parse(((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string));
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };

    expect(difyChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('POST /api/v2/chatbot/chat keeps the current assistant message aligned to EXPLAIN_PROCESS.active while storing the next-turn floor separately', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession());
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'active',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
      },
      chatbot_v2_floor: {
        journey_snapshot: {
          current_stage: 'EXPLAIN_PROCESS',
          current_phase: 'pre',
        },
        allowed_resources: [{
          resource_type: 'PROCESS_GUIDE',
          resource_id: 'process-guide:session-1',
          status: 'available',
          stage_binding: {
            stage: 'EXPLAIN_PROCESS',
            phase: 'active',
          },
          visibility: { mode: 'journey' },
          payload: {
            title: 'Understand our consultation process',
          },
          actions: ['open'],
        }],
        request_class: 'process_explanation',
        response_intent: 'process_explanation',
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-process-guide-only',
      answer: JSON.stringify({
        answer: 'How the process works.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: null,
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['process_explained'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Okay.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
      resources: Array<{ resourceType: string }>;
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
      resources: Array<{ resourceType: string }>;
    };

    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(json.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(json.resources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
    ]));

    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
    ]));
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2Floor.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
    ]));
  });

  it('POST /api/v2/chatbot/chat keeps FAQ overlay in COLLECT_MEDICAL_INPUTS.pre without corrupting the lifecycle gate', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession());
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'COLLECT_MEDICAL_INPUTS',
          current_phase: 'pre',
        },
        allowed_resources: [
          {
            resource_type: 'MEDICAL_DOC_UPLOAD',
            resource_id: 'medical-doc-upload:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: { title: 'Upload your records' },
            actions: ['open'],
          },
          {
            resource_type: 'QUESTIONNAIRE',
            resource_id: 'questionnaire:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: { title: 'Complete your questionnaire' },
            actions: ['open'],
          },
        ],
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-collect-pre-faq',
      answer: JSON.stringify({
        answer: 'We ask for records so the doctors can make a more precise assessment.',
        intent: 'FAQ',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'ANSWER_FAQ',
        responseMode: 'grounded_answer',
        reasonCodes: ['faq_answer'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Why do you need my medical records?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const difyChatbotV2 = JSON.parse(((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string));
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };

    expect(difyChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('POST /api/v2/chatbot/chat turns dismissing collect into COLLECT_MEDICAL_INPUTS.post pre-turn and RECOMMENDATION.pre post-turn', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession());
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'session-1',
        journey_snapshot: {
          current_stage: 'COLLECT_MEDICAL_INPUTS',
          current_phase: 'active',
        },
        allowed_resources: [
          {
            resource_type: 'MEDICAL_DOC_UPLOAD',
            resource_id: 'medical-doc-upload:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: { title: 'Upload your records' },
            actions: ['open'],
          },
          {
            resource_type: 'QUESTIONNAIRE',
            resource_id: 'questionnaire:session-1',
            status: 'available',
            stage_binding: {
              stage: 'COLLECT_MEDICAL_INPUTS',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: { title: 'Complete your questionnaire' },
            actions: ['open'],
          },
        ],
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-collect-dismiss',
      answer: JSON.stringify({
        answer: 'Understood. I will summarize this step and move on to recommendation.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: null,
        responseMode: 'grounded_plus_guidance',
        reasonCodes: ['dismiss_collect'],
        shortlist: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Let us skip this and go to the recommendations.',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const difyChatbotV2 = JSON.parse(((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string));
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedMetadata = storedAssistantPatch.metadata as Record<string, unknown>;
    const storedChatbotV2 = storedMetadata.chatbotV2 as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };
    const storedChatbotV2Floor = storedMetadata.chatbotV2Floor as {
      journeySnapshot: { currentStage: string; currentPhase: string };
    };

    expect(difyChatbotV2.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
    expect(json.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
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
          pageContext: JSON.stringify({
            type: 'HOSPITAL_DETAIL',
            hospitalId: 'hospital-123',
            hospitalName: 'Medora Seoul',
          }),
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
          attachments: JSON.stringify([{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }]),
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat keeps action-driven affordances on resources only', async () => {
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
    expectNoLegacyChatbotUiFields(rawJson as Record<string, unknown>);

    const json = chatbotChatResponseSchema.parse(rawJson);
    expect(json.resources.map((resource) => resource.resourceType)).toContain('PROCESS_GUIDE');
  });

  it('POST /api/v2/chatbot/chat leaves legacy REQUEST_DOCS nextAction out of the public contract', async () => {
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: null,
      }),
    );
  });

  it('POST /api/v2/chatbot/chat leaves legacy CONSULT_CONVERSION nextAction out of the public contract', async () => {
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
  });

  it('POST /api/v2/chatbot/chat strips public action overlays from metadata while keeping internal canonical storage', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-public-metadata',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        internalNextAction: 'REQUEST_DOC_UPLOAD',
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata.nextAction).toBeUndefined();
    expect(json.metadata.publicNextAction).toBeUndefined();
    expect(json.metadata.next_action).toBeUndefined();
    expect(json.metadata.public_next_action).toBeUndefined();
    expect(json.metadata.internalNextAction).toBeUndefined();
    expect(json.metadata.internal_next_action).toBeUndefined();
    expect((json.metadata.structuredOutput as Record<string, unknown>).nextAction).toBeUndefined();
    expect(((json.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>).publicNextAction).toBeUndefined();
    expect(((json.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>).internalNextAction).toBeUndefined();
  });

  it('POST /api/v2/chatbot/chat persists canonical semantic and action metadata while keeping the public contract aligned', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-persist-canonical',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        internalNextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_plus_guidance',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'NONE',
        mentionsCondition: true,
        mentionsDoctorOrHospitalNeed: false,
        metadata: {
          nextAction: 'REQUEST_DOC_UPLOAD',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          internalNextAction: 'REQUEST_DOC_UPLOAD',
          public_next_action: 'REQUEST_DOC_UPLOAD',
          internal_next_action: 'REQUEST_DOC_UPLOAD',
          engagement_signal: 'DEEP_WORKFLOW',
          progression_signal: 'READY_TO_PROCEED',
          recommendation_signal: 'NONE',
          mentions_condition: true,
          mentions_doctor_or_hospital_need: false,
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'NONE',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    });
    expect((json.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
    });
    expect(((json.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'NONE',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          resolvedIntent: 'REQUEST_DOC_UPLOAD',
          engagementSignal: 'DEEP_WORKFLOW',
          progressionSignal: 'READY_TO_PROCEED',
          recommendationSignal: 'NONE',
          mentionsCondition: true,
          mentionsDoctorOrHospitalNeed: false,
          nextAction: 'REQUEST_DOC_UPLOAD',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          public_next_action: 'REQUEST_DOC_UPLOAD',
          internalNextAction: 'REQUEST_DOC_UPLOAD',
          internal_next_action: 'REQUEST_DOC_UPLOAD',
          structuredOutput: expect.objectContaining({
            resolvedIntent: 'REQUEST_DOC_UPLOAD',
            nextAction: 'REQUEST_DOC_UPLOAD',
            metadata: expect.objectContaining({
              resolvedIntent: 'REQUEST_DOC_UPLOAD',
              engagementSignal: 'DEEP_WORKFLOW',
              progressionSignal: 'READY_TO_PROCEED',
              recommendationSignal: 'NONE',
              mentionsCondition: true,
              mentionsDoctorOrHospitalNeed: false,
              nextAction: 'REQUEST_DOC_UPLOAD',
              publicNextAction: 'REQUEST_DOC_UPLOAD',
              public_next_action: 'REQUEST_DOC_UPLOAD',
              internalNextAction: 'REQUEST_DOC_UPLOAD',
              internal_next_action: 'REQUEST_DOC_UPLOAD',
            }),
          }),
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat treats top-level resolvedIntent as the canonical persisted truth', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-top-level-resolved-intent',
      answer: JSON.stringify({
        answer: 'I can explain package options for that.',
        intent: 'CONSULT',
        resolvedIntent: 'ASK_PACKAGE_INFO',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'SHOW_PACKAGE',
        responseMode: 'package_guidance',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-top-level-resolved-intent',
        hospitalType: 'COSMETIC',
        message: 'Do you have a package for this?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'ASK_PACKAGE_INFO',
      semanticSignals: expect.objectContaining({
        resolvedIntent: 'ASK_PACKAGE_INFO',
      }),
    });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'ASK_PACKAGE_INFO',
        nextAction: 'SHOW_PACKAGE',
        metadata: expect.objectContaining({
          resolvedIntent: 'ASK_PACKAGE_INFO',
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat prefers top-level resolvedIntent over deprecated canonicalResolvedIntent when both are present', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-resolved-intent-conflict',
      answer: JSON.stringify({
        answer: 'I can explain package options for that.',
        intent: 'CONSULT',
        resolvedIntent: 'ASK_PACKAGE_INFO',
        canonicalResolvedIntent: 'ASK_CONSULT_PROCESS',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'SHOW_PACKAGE',
        responseMode: 'package_guidance',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-resolved-intent-conflict',
        hospitalType: 'COSMETIC',
        message: 'Do you have a package for this?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'ASK_PACKAGE_INFO',
      semanticSignals: expect.objectContaining({
        resolvedIntent: 'ASK_PACKAGE_INFO',
      }),
    });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'ASK_PACKAGE_INFO',
        metadata: expect.objectContaining({
          resolvedIntent: 'ASK_PACKAGE_INFO',
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat prefers the first valid canonical semantic and action values over invalid higher-priority fields', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-first-valid-fallback',
      answer: JSON.stringify({
        answer: 'Please upload your reports first.',
        intent: 'CONSULT',
        resolvedIntent: 'NOT_REAL',
        engagementSignal: 'INVALID',
        progressionSignal: 'INVALID',
        recommendationSignal: 'INVALID',
        nextAction: 'FREEFORM_ACTION',
        internalNextAction: 'FREEFORM_ACTION',
        riskLevel: 'NORMAL',
        canAnswer: true,
        metadata: {
          resolved_intent: 'REQUEST_DOC_UPLOAD',
          engagement_signal: 'DEEP_WORKFLOW',
          progression_signal: 'READY_TO_PROCEED',
          recommendation_signal: 'NONE',
          public_next_action: 'REQUEST_DOC_UPLOAD',
          internal_next_action: 'REQUEST_DOC_UPLOAD',
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-first-valid-fallback',
        hospitalType: 'COSMETIC',
        message: 'Where do I upload my reports?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'NONE',
    });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          resolvedIntent: 'REQUEST_DOC_UPLOAD',
          engagementSignal: 'DEEP_WORKFLOW',
          progressionSignal: 'READY_TO_PROCEED',
          recommendationSignal: 'NONE',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          internalNextAction: 'REQUEST_DOC_UPLOAD',
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat keeps root metadata and structuredOutput semantically aligned on the same canonical values', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-structured-output-alignment',
      answer: JSON.stringify({
        answer: 'I can explain package options for that.',
        intent: 'CONSULT',
        resolvedIntent: 'NOT_REAL',
        nextAction: 'FREEFORM_ACTION',
        riskLevel: 'NORMAL',
        canAnswer: true,
        citations: [],
      }),
      metadata: {
        retriever_resources: [],
        resolved_intent: 'ASK_PACKAGE_INFO',
        engagement_signal: 'QUALIFIED_EXPLORATION',
        progression_signal: 'OPEN_TO_NEXT_STEP',
        recommendation_signal: 'NONE',
        public_next_action: 'SHOW_PACKAGE',
        internal_next_action: 'SHOW_PACKAGE',
      },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-structured-output-alignment',
        hospitalType: 'COSMETIC',
        message: 'Do you have a package for this?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'ASK_PACKAGE_INFO',
      engagementSignal: 'QUALIFIED_EXPLORATION',
      progressionSignal: 'OPEN_TO_NEXT_STEP',
      recommendationSignal: 'NONE',
    });
    expect((json.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'ASK_PACKAGE_INFO',
    });
    expect(((json.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'ASK_PACKAGE_INFO',
      engagementSignal: 'QUALIFIED_EXPLORATION',
      progressionSignal: 'OPEN_TO_NEXT_STEP',
      recommendationSignal: 'NONE',
    });
  });

  it('POST /api/v2/chatbot/chat keeps legacy intent-only payload persistence meaningful while public canonical metadata stays strict', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-legacy-intent-only',
      answer: JSON.stringify({
        answer: 'Please upload your reports first.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_plus_guidance',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-legacy-intent-only',
        hospitalType: 'COSMETIC',
        message: 'Where do I upload my reports?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.intent).toBe('CONSULT');
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'UNKNOWN',
    });
    expect((json.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'UNKNOWN',
    });

    const persistedPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(persistedPatch.intent).toBe('CONSULT');
    expect(persistedPatch.resolvedIntent).toBe('CONSULT');
    expect(persistedPatch.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(persistedPatch.metadata).toMatchObject({
      publicNextAction: 'REQUEST_DOC_UPLOAD',
      structuredOutput: expect.objectContaining({
        nextAction: 'REQUEST_DOC_UPLOAD',
      }),
    });
    expect((persistedPatch.metadata as Record<string, unknown>).resolvedIntent).toBeUndefined();
    expect(((persistedPatch.metadata as Record<string, unknown>).structuredOutput as Record<string, unknown>).resolvedIntent).toBeUndefined();
  });

  it('POST /api/v2/chatbot/chat persists canonical public nextAction when provider exposes it only through metadata', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-metadata-only-action',
      answer: JSON.stringify({
        answer: 'Please upload your documents first.',
        intent: 'CONSULT',
        resolvedIntent: 'REQUEST_DOC_UPLOAD',
        riskLevel: 'NORMAL',
        canAnswer: true,
        responseMode: 'grounded_plus_guidance',
        engagementSignal: 'DEEP_WORKFLOW',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'NONE',
        mentionsCondition: true,
        mentionsDoctorOrHospitalNeed: false,
        metadata: {
          public_next_action: 'REQUEST_DOC_UPLOAD',
          internal_next_action: 'REQUEST_DOC_UPLOAD',
        },
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-metadata-only-action',
        hospitalType: 'COSMETIC',
        message: 'Where do I upload my reports?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.metadata.nextAction).toBeUndefined();
    expect(json.metadata.publicNextAction).toBeUndefined();
    expect(json.metadata.internalNextAction).toBeUndefined();
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          nextAction: 'REQUEST_DOC_UPLOAD',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          internalNextAction: 'REQUEST_DOC_UPLOAD',
        }),
      }),
    );
  });

  it('POST /api/v2/chatbot/chat persists canonical resolvedIntent when provider sends only the canonical field shape', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-canonical-resolved-intent-only',
      answer: JSON.stringify({
        answer: 'I can explain how online consultation works.',
        intent: 'CONSULT',
        canonicalResolvedIntent: 'ASK_CONSULT_PROCESS',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'EXPLAIN_CONSULT_PROCESS',
        responseMode: 'consult_explanation',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-canonical-resolved-intent-only',
        hospitalType: 'COSMETIC',
        message: 'How does the online consultation process work?',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.metadata).toMatchObject({
      resolvedIntent: 'ASK_CONSULT_PROCESS',
      semanticSignals: expect.objectContaining({
        resolvedIntent: 'ASK_CONSULT_PROCESS',
      }),
    });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        metadata: expect.objectContaining({
          resolvedIntent: 'ASK_CONSULT_PROCESS',
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
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(json.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
    ]));
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.responseMode).toBe('light_discovery_guidance');
    expect(json.metadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.responseMode).toBe('consult_explanation');
    expect(json.metadata).toMatchObject({
      engagementMode: 'QUALIFIED_EXPLORATION',
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.secondaryAction).toBe('REQUEST_DOCS');
    expect(json.responseMode).toBe('deep_workflow_progression');
    expect(json.metadata).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
    });
  });

  it.each([
    {
      family: 'service-overview',
      sessionId: 'session-multilingual-service-overview',
      expectedIntent: 'FAQ',
      expectedChatbotV2Journey: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      prompts: [
        'I want to understand your services.',
        '我想来了解下你们的服务内容。',
      ],
      difyResponse: {
        conversation_id: 'dify-conv-service-overview',
        answer: JSON.stringify({
          answer: 'We can walk you through how the process works.',
          intent: 'FAQ',
          resolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
          engagementSignal: 'LIGHT_DISCOVERY',
          progressionSignal: 'CURIOUS',
          recommendationSignal: 'NONE',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: false,
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
          responseMode: 'light_discovery_guidance',
          engagementMode: 'LIGHT_DISCOVERY',
          metadata: {
            internalNextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
          },
          reasonCodes: ['service_overview'],
          citations: [],
        }),
        metadata: { retriever_resources: [] },
      },
      expectedNextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      expectedResolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
      expectedPublicMetadata: {
        resolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
        engagementSignal: 'LIGHT_DISCOVERY',
        progressionSignal: 'CURIOUS',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        semanticSignals: {
          resolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
          engagementSignal: 'LIGHT_DISCOVERY',
          progressionSignal: 'CURIOUS',
          recommendationSignal: 'NONE',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: false,
        },
        engagementMode: 'LIGHT_DISCOVERY',
      },
      expectedBlocks: [
        expect.objectContaining({
          type: 'PROCESS_MODAL_TRIGGER',
          modalKey: 'MEDICAL_TRAVEL_PROCESS',
        }),
      ],
    },
    {
      family: 'consult-process',
      sessionId: 'session-multilingual-consult-process',
      expectedIntent: 'CONSULT',
      expectedChatbotV2Journey: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      prompts: [
        'I want to understand the consultation process.',
        '我想知道咨询流程。',
      ],
      difyResponse: {
        conversation_id: 'dify-conv-consult-process',
        answer: JSON.stringify({
          answer: 'We can explain how consultation usually works.',
          intent: 'CONSULT',
          resolvedIntent: 'ASK_CONSULT_PROCESS',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'OPEN_TO_NEXT_STEP',
          recommendationSignal: 'NONE',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: false,
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'EXPLAIN_CONSULT_PROCESS',
          responseMode: 'consult_explanation',
          engagementMode: 'QUALIFIED_EXPLORATION',
          metadata: {
            internalNextAction: 'EXPLAIN_CONSULT_PROCESS',
          },
          reasonCodes: ['consult_process'],
          citations: [],
        }),
        metadata: { retriever_resources: [] },
      },
      expectedNextAction: 'EXPLAIN_CONSULT_PROCESS',
      expectedResolvedIntent: 'ASK_CONSULT_PROCESS',
      expectedPublicMetadata: {
        resolvedIntent: 'ASK_CONSULT_PROCESS',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
        semanticSignals: {
          resolvedIntent: 'ASK_CONSULT_PROCESS',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'OPEN_TO_NEXT_STEP',
          recommendationSignal: 'NONE',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: false,
        },
        engagementMode: 'QUALIFIED_EXPLORATION',
      },
      expectedBlocks: [],
    },
    {
      family: 'doctor-or-hospital-direction',
      sessionId: 'session-multilingual-direction',
      expectedIntent: 'CONSULT',
      expectedChatbotV2Journey: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      prompts: [
        'I need help finding the right doctor or hospital.',
        '我得了颈椎病，我想找颈椎病方向的医生。',
      ],
      difyResponse: {
        conversation_id: 'dify-conv-direction',
        answer: JSON.stringify({
          answer: 'We can help you compare a few good options.',
          intent: 'CONSULT',
          resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'OPEN_TO_NEXT_STEP',
          recommendationSignal: 'SEEKING_DIRECTION',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: true,
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          responseMode: 'grounded_plus_guidance',
          engagementMode: 'QUALIFIED_EXPLORATION',
          metadata: {
            internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          },
          reasonCodes: ['direction_request'],
          shortlist: [
            {
              hospitalId: 'hospital-direction-1',
              name: 'Direction Hospital',
              reason: 'Good starting point for comparison',
              matchType: 'matched',
              reasonCodes: ['direction_fit'],
            },
          ],
          citations: [],
        }),
        metadata: { retriever_resources: [] },
      },
      expectedNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      expectedResolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
      expectedPublicMetadata: {
        resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'OPEN_TO_NEXT_STEP',
        recommendationSignal: 'SEEKING_DIRECTION',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: true,
        semanticSignals: {
          resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'OPEN_TO_NEXT_STEP',
          recommendationSignal: 'SEEKING_DIRECTION',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: true,
        },
        engagementMode: 'QUALIFIED_EXPLORATION',
      },
      expectedBlocks: [],
    },
    {
      family: 'recommendation-ask',
      sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
      expectedIntent: 'CONSULT',
      expectedChatbotV2Journey: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      prompts: [
        'Can you recommend which hospital I should talk to?',
        '你能推荐适合我的医院吗？',
      ],
      difyResponse: {
        conversation_id: 'dify-conv-recommendation',
        answer: JSON.stringify({
          answer: 'Here are a few hospitals that look like a fit.',
          intent: 'CONSULT',
          resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'READY_TO_PROCEED',
          recommendationSignal: 'READY_FOR_RECOMMENDATION',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: true,
          riskLevel: 'NORMAL',
          canAnswer: true,
          nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          responseMode: 'grounded_plus_guidance',
          engagementMode: 'QUALIFIED_EXPLORATION',
          metadata: {
            internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          },
          reasonCodes: ['recommendation_request'],
          shortlist: [
            {
              hospitalId: '550e8400-e29b-41d4-a716-446655440001',
              name: 'Recommendation Hospital',
              reason: 'Strong fit for the current profile',
              matchType: 'matched',
              reasonCodes: ['recommendation_fit'],
            },
          ],
          citations: [],
        }),
        metadata: { retriever_resources: [] },
      },
      expectedNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      expectedResolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      expectedPublicMetadata: {
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        engagementSignal: 'QUALIFIED_EXPLORATION',
        progressionSignal: 'READY_TO_PROCEED',
        recommendationSignal: 'READY_FOR_RECOMMENDATION',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: true,
        semanticSignals: {
          resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
          engagementSignal: 'QUALIFIED_EXPLORATION',
          progressionSignal: 'READY_TO_PROCEED',
          recommendationSignal: 'READY_FOR_RECOMMENDATION',
          mentionsCondition: false,
          mentionsDoctorOrHospitalNeed: true,
        },
        engagementMode: 'QUALIFIED_EXPLORATION',
      },
      expectedBlocks: [],
    },
  ])('POST /api/v2/chatbot/chat keeps $family prompts aligned across English and Chinese', async ({
    sessionId,
    expectedIntent,
    expectedChatbotV2Journey,
    prompts,
    difyResponse,
    expectedNextAction,
    expectedResolvedIntent,
    expectedPublicMetadata,
    expectedBlocks,
  }) => {
    const expectedStatusSnapshot = {
      conditionStatus: 'unknown',
      formStatus: 'not_started',
      docUploadStatus: 'none',
      recommendationStatus: 'not_started',
      consultationStatus: 'not_started',
      packageStatus: 'not_introduced',
      handoffStatus: 'not_needed',
      riskLevel: 'low',
      trustOrObjection: 'none',
      engagementMode: 'LIGHT_DISCOVERY',
      enteredDeepWorkflowAt: null,
      processExplained: false,
      conversationSummary: 'overview-state',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    };
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId,
      statusSnapshot: expectedStatusSnapshot,
    }));

    for (const prompt of prompts) {
      mockServices.difyClassifierApi.createChatMessage.mockResolvedValueOnce({
        answer: JSON.stringify(
          expectedChatbotV2Journey.currentStage === 'COLLECT_MEDICAL_INPUTS'
            ? {
                requestClass: 'progression_request',
                targetResourceTypes: [],
                includeProgressionFollowUp: false,
              }
            : {
                requestClass: 'faq',
                targetResourceTypes: [],
                includeProgressionFollowUp: false,
              },
        ),
      });
      mockServices.difyApi.createChatMessage.mockResolvedValueOnce(difyResponse);

      const res = await app.request('/api/v2/chatbot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          hospitalType: 'COSMETIC',
          message: prompt,
        }),
      });

      expect(res.status).toBe(200);
      const json = chatbotChatResponseSchema.parse(await res.json());
      const difyPayload = mockServices.difyApi.createChatMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      const structuredOutput = json.metadata.structuredOutput as Record<string, unknown>;
      const structuredOutputMetadata = (structuredOutput.metadata as Record<string, unknown>);

      expect(json.intent).toBe(expectedIntent);
      expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
      expect(difyPayload).toEqual({
        inputs: expect.objectContaining({
          hospitalType: 'COSMETIC',
          sessionId,
          assistantMessageId: expect.any(String),
          attachmentsJson: '[]',
          pageContextJson: 'null',
          currentStatus: expect.stringContaining(`"conversationSummary":"${expectedStatusSnapshot.conversationSummary}"`),
          conversationSummary: expectedStatusSnapshot.conversationSummary,
          attachments: '[]',
          pageContext: 'null',
          ...(expectedChatbotV2Journey.currentStage === 'COLLECT_MEDICAL_INPUTS'
            ? {}
            : {
                faqGrounding: JSON.stringify({
                  faqScope: 'GENERAL_ONLY',
                  categories: ['Consultation Process'],
                  groundedContext: 'Grounded FAQ context',
                }),
              }),
          chatbotV2: expect.stringContaining(`"currentStage":"${expectedChatbotV2Journey.currentStage}"`),
        }),
        query: prompt,
        user: sessionId,
        conversationId: null,
      });
      expect(JSON.parse((difyPayload.inputs as Record<string, unknown>).chatbotV2 as string)).toEqual(expect.objectContaining({
            journeySnapshot: expectedChatbotV2Journey,
            resources: expect.any(Array),
      }));
      expect(json.metadata).toMatchObject(expectedPublicMetadata);
      for (const key of [
        'language',
        'messageLanguage',
        'message_language',
        'detectedLanguage',
        'detected_language',
        'promptFamily',
        'prompt_family',
        'family',
        'resolvedIntentHint',
        'resolved_intent_hint',
        'engagementSignalHint',
        'engagement_signal_hint',
        'progressionSignalHint',
        'progression_signal_hint',
        'recommendationSignalHint',
        'recommendation_signal_hint',
        'canonicalHints',
        'canonical_hints',
        'promptHints',
        'prompt_hints',
      ]) {
        expect(json.metadata).not.toHaveProperty(key);
      }
      expect(structuredOutput).toMatchObject({
        intent: expectedIntent,
        resolvedIntent: expectedResolvedIntent,
      });
      expect(structuredOutputMetadata).toMatchObject(expectedPublicMetadata);
      for (const key of [
        'language',
        'messageLanguage',
        'message_language',
        'detectedLanguage',
        'detected_language',
        'promptFamily',
        'prompt_family',
        'family',
        'resolvedIntentHint',
        'resolved_intent_hint',
        'engagementSignalHint',
        'engagement_signal_hint',
        'progressionSignalHint',
        'progression_signal_hint',
        'recommendationSignalHint',
        'recommendation_signal_hint',
        'canonicalHints',
        'canonical_hints',
        'promptHints',
        'prompt_hints',
      ]) {
      expect(structuredOutputMetadata).not.toHaveProperty(key);
      }
    }
  });

  it('POST /api/v2/chatbot/chat returns 409 when an existing session is reused with a mismatched hospitalType', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        conversationSummary: null,
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

  it('POST /api/v2/chatbot/chat does not expose consult booking cards until CRM-owned chatbotV2 resources reach online consult', async () => {
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.resources.map((resource) => resource.resourceType)).not.toContain('ONLINE_CONSULT_BOOKING');
  });

  it('POST /api/v2/chatbot/chat keeps consult booking cards hidden until CRM-owned chatbotV2 resources actually expose online consult booking', async () => {
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
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    expect(json.resources.map((resource) => resource.resourceType)).not.toContain('ONLINE_CONSULT_BOOKING');
  });

  it('POST /api/v2/chatbot/chat enriches questionnaire resources from refreshed session status after writeback', async () => {
    const questionnaireTemplateId = '11111111-1111-4111-8111-111111111111';
    mockServices.aiChatSessionRepo.findBySessionId
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-1',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-1',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }));
    mockServices.caseRepo.findById.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      structuredData: {
        patientHospitalSelection: {
          medicalFormStatus: 'NOT_STARTED',
        },
      },
    });
    mockServices.getTemplateByDisease.execute.mockResolvedValue({
      template: {
        id: questionnaireTemplateId,
      },
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-1',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-docs-refresh',
      answer: JSON.stringify({
        answer: 'Please upload your records so I can guide the next step more accurately.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_with_guidance',
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
        hospitalType: 'REGULAR',
        message: '我得了颈椎病，我想找颈椎病方向的医生',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedChatbotV2Floor = ((storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2Floor as {
      resources: Array<{ resourceType: string; payload?: Record<string, unknown> }>;
    });
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2Floor.resources.map((resource) => resource.resourceType)).toContain('QUESTIONNAIRE');
  });

  it('POST /api/v2/chatbot/chat enriches questionnaire resources from the default template when writeback status is not visible yet', async () => {
    const questionnaireTemplateId = '33333333-3333-4333-8333-333333333333';
    mockServices.aiChatSessionRepo.findBySessionId
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-3:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-3',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-3:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-3',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }));
    mockServices.caseRepo.findById.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      structuredData: {
        patientHospitalSelection: {
          medicalFormStatus: 'NOT_STARTED',
        },
      },
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-3',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.getTemplateByDisease.execute.mockResolvedValue({
      template: {
        id: questionnaireTemplateId,
      },
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-docs-default-template',
      answer: JSON.stringify({
        answer: 'Please upload your records so I can guide the next step more accurately.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_with_guidance',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-3',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-3:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'REGULAR',
        message: 'Please recommend a hospital for me',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedChatbotV2Floor = ((storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2Floor as {
      resources: Array<{ resourceType: string }>;
    });
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2Floor.resources.map((resource) => resource.resourceType)).toContain('QUESTIONNAIRE');
    expect(mockServices.getTemplateByDisease.execute).toHaveBeenCalledWith('DEFAULT');
  });

  it('POST /api/v2/chatbot/chat prefers a case-specific questionnaire template over the default fallback', async () => {
    const questionnaireTemplateId = '77777777-7777-4777-8777-777777777777';
    mockServices.aiChatSessionRepo.findBySessionId
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-7:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-7',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-7:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-7',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }));
    mockServices.caseRepo.findById.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      questionCollectorTemplateId: questionnaireTemplateId,
      structuredData: {
        patientHospitalSelection: {
          medicalFormStatus: 'NOT_STARTED',
        },
      },
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-7',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-docs-case-template',
      answer: JSON.stringify({
        answer: 'Please upload your records so I can guide the next step more accurately.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_with_guidance',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-7',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-7:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'REGULAR',
        message: 'Please recommend a hospital for me',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expectNoLegacyChatbotUiFields(json as Record<string, unknown>);
    const storedAssistantPatch = mockServices.aiChatMessageRepo.updateMessage.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const storedChatbotV2Floor = ((storedAssistantPatch.metadata as Record<string, unknown>).chatbotV2Floor as {
      resources: Array<{ resourceType: string; payload?: Record<string, unknown> }>;
    });
    expect(storedChatbotV2Floor.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(storedChatbotV2Floor.resources.map((resource) => resource.resourceType)).toContain('QUESTIONNAIRE');
    expect(mockServices.getTemplateByDisease.execute).not.toHaveBeenCalledWith('DEFAULT');
  });

  it('POST /api/v2/chatbot/chat enriches hospital recommendation resources with shortlist payloads when the conversation reaches recommendation', async () => {
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
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        journey_snapshot: {
          current_stage: 'RECOMMENDATION',
          current_phase: 'pre',
        },
        allowed_resources: [
          {
            resource_type: 'HOSPITAL_RECOMMENDATION',
            resource_id: 'hospital-recommendation:widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
            status: 'available',
            stage_binding: {
              stage: 'RECOMMENDATION',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: {
              recommendationKind: 'hospital',
            },
            actions: ['open', 'submit'],
          },
        ],
      },
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'resource_request',
        targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-recommendation-resource',
      answer: JSON.stringify({
        answer: 'Here are a few hospitals that look like a fit.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        responseMode: 'grounded_plus_guidance',
        shortlist: [
          {
            hospitalId: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Recommendation Hospital',
            reason: 'Strong fit for the current profile',
            matchType: 'matched',
            reasonCodes: ['recommendation_fit'],
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
    const hospitalResource = json.resources.find((resource) => resource.resourceType === 'HOSPITAL_RECOMMENDATION');
    expect(hospitalResource?.payload).toMatchObject({
      title: 'Recommended hospitals',
      description: 'Based on your current information, these look like the closest matches.',
      caseId: '550e8400-e29b-41d4-a716-446655440000',
      selectPath: '/select-hospitals',
      hospitals: [
        expect.objectContaining({
          hospitalId: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Recommendation Hospital',
          reason: 'Strong fit for the current profile',
          matchType: 'matched',
          reasonCodes: ['recommendation_fit'],
        }),
      ],
    });
  });

  it('POST /api/v2/chatbot/chat enriches online consult booking resources with conversion drafts', async () => {
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
    mockServices.getAiPolicyContext.execute.mockResolvedValue({
      chatbot_v2: {
        scope_id: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        journey_snapshot: {
          current_stage: 'ONLINE_CONSULT',
          current_phase: 'pre',
        },
        allowed_resources: [
          {
            resource_type: 'ONLINE_CONSULT_BOOKING',
            resource_id: 'online-consult-booking:widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
            status: 'available',
            stage_binding: {
              stage: 'ONLINE_CONSULT',
              phase: 'active',
            },
            visibility: { mode: 'journey' },
            payload: {
              title: 'Book an online consultation',
            },
            actions: ['open', 'submit'],
          },
        ],
      },
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'assistant-history-1',
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
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'resource_request',
        targetResourceTypes: ['ONLINE_CONSULT_BOOKING'],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-online-consult-resource',
      answer: JSON.stringify({
        answer: 'We can move to an online consultation next.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'INVITE_ONLINE_CONSULT',
        internalNextAction: 'INVITE_ONLINE_CONSULT',
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
    const consultResource = json.resources.find((resource) => resource.resourceType === 'ONLINE_CONSULT_BOOKING');
    expect(consultResource?.payload).toMatchObject({
      title: 'Request online consultation',
      description: 'Submit your consultation request and we will confirm the next step.',
      requestedAction: 'INVITE_ONLINE_CONSULT',
      convertPath: '/api/v2/chatbot/convert',
      consultationStatus: 'ready',
      conversionDraft: {
        sessionId: 'widget-chat:patient-1:550e8400-e29b-41d4-a716-446655440000',
        name: 'Hao Wang',
        email: 'hao@example.com',
        country: 'China',
        conditionSummary: 'Need a treatment plan for persistent eye pain.',
        budget: 'Flexible',
      },
    });
  });

  it('POST /api/v2/chatbot/chat derives public intent from canonical resolvedIntent when provider intent drifts', async () => {
    mockServices.aiChatSessionRepo.findBySessionId
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-4:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-4',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-4:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-4',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-4',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-intent-drift',
      answer: JSON.stringify({
        answer: 'Please upload your reports so I can recommend a shortlist.',
        intent: 'UNKNOWN',
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_with_guidance',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-4',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-4:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'REGULAR',
        message: 'Please recommend a hospital for me',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotChatResponseSchema.parse(await res.json());
    expect(json.intent).toBe('CONSULT');
    expect((json.metadata.structuredOutput as Record<string, unknown>).intent).toBe('CONSULT');
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        intent: 'CONSULT',
      }),
    );
  });

  it('POST /api/v2/chatbot/chat refreshes session state before saving difyConversationId so writeback status is not overwritten', async () => {
    mockServices.aiChatSessionRepo.findBySessionId
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-2:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-2',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-2:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-2',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }))
      .mockResolvedValueOnce(makeSession({
        sessionId: 'widget-chat:patient-2:550e8400-e29b-41d4-a716-446655440000',
        patientId: 'patient-2',
        hospitalType: 'REGULAR',
        statusSnapshot: {
          consultationStatus: 'not_introduced',
        },
      }));
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({
      userId: 'patient-2',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: JSON.stringify({
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      }),
    });
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([]);
    mockServices.difyApi.createChatMessage.mockResolvedValue({
      conversation_id: 'dify-conv-docs-preserve',
      answer: JSON.stringify({
        answer: 'Please upload your records so I can guide the next step more accurately.',
        intent: 'CONSULT',
        riskLevel: 'NORMAL',
        canAnswer: true,
        nextAction: 'REQUEST_DOC_UPLOAD',
        responseMode: 'grounded_with_guidance',
        citations: [],
      }),
      metadata: { retriever_resources: [] },
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-2',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-2:550e8400-e29b-41d4-a716-446655440000',
        hospitalType: 'REGULAR',
        message: 'Please recommend a hospital for me',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.aiChatSessionRepo.setDifyConversationId).toHaveBeenCalledWith(
      'widget-chat:patient-2:550e8400-e29b-41d4-a716-446655440000',
      'beauty',
      'dify-conv-docs-preserve',
    );
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

  it('POST /api/v2/chatbot/chat returns 502 when classifier transport fails after the assistant draft is created', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi.createChatMessage.mockRejectedValue(new Error('classifier unavailable'));

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'Please help me continue.',
      }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'classifier unavailable' });
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: 'ASSISTANT',
        content: '',
      }),
    );
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          draftState: 'provider_error',
          failureStage: 'provider_request',
        }),
      }),
    );
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
  });

  it('POST /api/v2/chatbot/chat returns 502 when classifier returns an invalid payload', async () => {
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockServices.difyClassifierApi.createChatMessage.mockResolvedValue({
      answer: '{"requestClass":"faq","targetResourceTypes":"not-an-array"}',
    });

    const res = await app.request('/api/v2/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        hospitalType: 'COSMETIC',
        message: 'How does this work?',
      }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Invalid classifier result payload' });
    expect(mockServices.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          draftState: 'provider_error',
          failureStage: 'provider_request',
        }),
      }),
    );
    expect(mockServices.difyApi.createChatMessage).not.toHaveBeenCalled();
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
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1', 'beauty');
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

  it('GET /api/v2/chatbot/history/{sessionId} rejects persisted sessions from a different site even with a valid secret', async () => {
    const sessionSecret = 'secret-site-mismatch';
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'session-site-mismatch',
      sessionSecretHash: createHash('sha256').update(sessionSecret).digest('hex'),
      site: 'beauty',
    }));

    const res = await app.request('/api/v2/chatbot/history/session-site-mismatch?limit=2', {
      method: 'GET',
      headers: {
        Cookie: `chatbot_session_secret=${sessionSecret}`,
        'x-medora-site': 'china',
      },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
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
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1', 'beauty');
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
    expect(json.messages[1]?.nextAction).toBeNull();
    expect('blocks' in (json.messages[1] as Record<string, unknown>)).toBe(false);
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

  it('GET /api/v2/chatbot/history/{sessionId} keeps non-semantic user metadata blobs free of synthetic canonical semantics', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-user-non-semantic-metadata',
        role: 'USER',
        content: 'Uploaded attachments',
        metadata: {
          attachments: [{
            fileName: 'report.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            storageKey: 'crm/dev/chatbot/report.pdf',
          }],
          pageContext: {
            pageType: 'LANDING',
            path: '/treatments/hydrafacial',
          },
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
    expect(json.messages[0]?.metadata).toMatchObject({
      attachments: [{
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'crm/dev/chatbot/report.pdf',
      }],
      pageContext: {
        pageType: 'LANDING',
        path: '/treatments/hydrafacial',
      },
    });
    expect(json.messages[0]?.metadata.resolvedIntent).toBeUndefined();
    expect(json.messages[0]?.metadata.engagementSignal).toBeUndefined();
    expect(json.messages[0]?.metadata.semanticSignals).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} does not replay stored rich blocks for assistant messages', async () => {
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
    expect('blocks' in (json.messages[0] as Record<string, unknown>)).toBe(false);
  });

  it('GET /api/v2/chatbot/history/{sessionId} strips legacy metadata blocks without corrupting nested resource payload fields', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-assistant-nested-resource-payload',
        role: 'ASSISTANT',
        content: 'Here is your next step.',
        metadata: {
          blocks: [{
            id: 'legacy-block-1',
            type: 'PROCESS_MODAL_TRIGGER',
          }],
          chatbotV2: {
            journeySnapshot: {
              currentStage: 'COLLECT_MEDICAL_INPUTS',
              currentPhase: 'active',
            },
            resources: [{
              resourceType: 'PROCESS_GUIDE',
              resourceId: 'process-guide-1',
              status: 'available',
              visibility: {
                mode: 'journey',
              },
              payload: {
                title: 'Process guide',
                blocks: ['slot-a', 'slot-b'],
              },
              actions: ['open'],
            }],
          },
          structuredOutput: {
            metadata: {
              blocks: [{
                id: 'legacy-structured-block',
                type: 'PROCESS_MODAL_TRIGGER',
              }],
            },
          },
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
    expect((json.messages[0]?.metadata as Record<string, unknown>).blocks).toBeUndefined();
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata as Record<string, unknown>).blocks)).toBeUndefined();
    expect((((((json.messages[0]?.metadata.chatbotV2 as Record<string, unknown>).resources as Array<Record<string, unknown>>)[0]?.payload as Record<string, unknown>).blocks))).toEqual(['slot-a', 'slot-b']);
  });

  it('GET /api/v2/chatbot/history/{sessionId} maps legacy ESCALATE history into HUMAN_HANDOFF while keeping workflow metadata raw', async () => {
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
    expect(((json.messages[1]?.metadata.workflow) as Record<string, unknown>).kind).toBe('ESCALATE');
    expect(((json.messages[1]?.metadata.workflow) as Record<string, unknown>).ticketId).toBe('ticket-1');
  });

  it('GET /api/v2/chatbot/history/{sessionId} keeps legacy convert workflow requestedAction raw in public metadata', async () => {
    const secret = 'secret-123';
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const persistedMessages: Array<ReturnType<typeof makeMessage>> = [];

    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionId: 'session-actual-persisted-workflow',
      sessionSecretHash: secretHash,
      patientId: null,
    }));
    mockServices.aiChatSessionRepo.attachPatient.mockResolvedValue(makeSession({
      sessionId: 'session-actual-persisted-workflow',
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.initOnboarding.execute.mockResolvedValue({
      token: 'patient-token-1',
      restoreCookie: 'restore-cookie-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      isExistingPatient: false,
      restoreToken: 'restore-token-1',
    });
    mockServices.caseRepo.findById.mockResolvedValue({
      id: 'case-1',
      patientId: 'patient-1',
      patientName: null,
      patientCountry: null,
      conditionSummary: null,
      structuredData: {},
    });
    mockServices.caseRepo.save.mockImplementation(async (entity: unknown) => entity);
    mockServices.aiChatMessageRepo.create.mockImplementation(async (entity: AiChatMessage) => {
      const persistedMetadata = JSON.parse(JSON.stringify(entity.metadata)) as Record<string, unknown>;
      const persistedWorkflow = persistedMetadata.workflow as Record<string, unknown> | undefined;
      if (
        persistedWorkflow?.kind === 'CONVERT'
        && persistedWorkflow.requestedAction === 'INVITE_ONLINE_CONSULT'
      ) {
        persistedWorkflow.requestedAction = 'CONSULT_CONVERSION';
      }

      const persistedMessage = makeMessage({
        id: entity.id,
        sessionId: entity.sessionId,
        role: entity.role,
        content: entity.content,
        intent: entity.intent,
        riskLevel: entity.riskLevel,
        canAnswer: entity.canAnswer,
        nextAction: entity.nextAction === 'INVITE_ONLINE_CONSULT'
          ? 'CONSULT_CONVERSION'
          : entity.nextAction,
        secondaryAction: entity.secondaryAction,
        responseMode: entity.responseMode,
        citations: JSON.parse(JSON.stringify(entity.citations)),
        reasonCodes: JSON.parse(JSON.stringify(entity.reasonCodes)),
        shortlist: JSON.parse(JSON.stringify(entity.shortlist)),
        metadata: persistedMetadata,
        createdAt: new Date(entity.createdAt.toISOString()),
      });
      persistedMessages.push(persistedMessage);
      return makeMessage({
        id: entity.id,
        sessionId: entity.sessionId,
        role: entity.role,
        content: entity.content,
        intent: entity.intent,
        riskLevel: entity.riskLevel,
        canAnswer: entity.canAnswer,
        nextAction: entity.nextAction,
        secondaryAction: entity.secondaryAction,
        responseMode: entity.responseMode,
        citations: JSON.parse(JSON.stringify(entity.citations)),
        reasonCodes: JSON.parse(JSON.stringify(entity.reasonCodes)),
        shortlist: JSON.parse(JSON.stringify(entity.shortlist)),
        metadata: JSON.parse(JSON.stringify(entity.metadata)),
        createdAt: new Date(entity.createdAt.toISOString()),
      }) as unknown as AiChatMessage;
    });
    mockServices.aiChatMessageRepo.listBySession.mockImplementation(async () => (
      persistedMessages.map((message) => makeMessage({
        ...message,
        metadata: JSON.parse(JSON.stringify(message.metadata)),
        citations: JSON.parse(JSON.stringify(message.citations)),
        reasonCodes: JSON.parse(JSON.stringify(message.reasonCodes)),
        shortlist: JSON.parse(JSON.stringify(message.shortlist)),
        createdAt: new Date(message.createdAt.toISOString()),
      }))
    ));

    const convertRes = await app.request('/api/v2/chatbot/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${secret}`,
      },
      body: JSON.stringify({
        sessionId: 'session-actual-persisted-workflow',
        name: 'Alice',
        email: 'alice@example.com',
        country: 'Singapore',
        conditionSummary: 'Revision rhinoplasty consultation',
        budget: 'USD 8000',
        requestedAction: 'INVITE_ONLINE_CONSULT',
      }),
    });

    expect(convertRes.status).toBe(200);
    expect(persistedMessages).toHaveLength(1);
    expect(persistedMessages[0]).toMatchObject({
      role: 'SYSTEM',
      content: 'Chatbot consultation details submitted.',
      nextAction: 'CONSULT_CONVERSION',
      metadata: {
        workflow: {
          kind: 'CONVERT',
          requestedAction: 'CONSULT_CONVERSION',
          patientId: 'patient-1',
          caseId: 'case-1',
          form: {
            name: 'Alice',
            email: 'alice@example.com',
            country: 'Singapore',
            conditionSummary: 'Revision rhinoplasty consultation',
            budget: 'USD 8000',
          },
        },
      },
    });
    expect(persistedMessages[0]?.metadata).toMatchObject({
      workflow: {
        kind: 'CONVERT',
        requestedAction: 'CONSULT_CONVERSION',
        patientId: 'patient-1',
        caseId: 'case-1',
      },
    });

    const historyRes = await app.request('/api/v2/chatbot/history/session-actual-persisted-workflow?limit=10', {
      method: 'GET',
      headers: {
        Cookie: `chatbot_session_secret=${secret}`,
      },
    });

    expect(historyRes.status).toBe(200);
    const json = chatbotHistoryResponseSchema.parse(await historyRes.json());
    expect(json.messages).toHaveLength(1);
    expect(json.messages[0]).toMatchObject({
      id: persistedMessages[0]?.id,
      role: 'SYSTEM',
      content: 'Chatbot consultation details submitted.',
      nextAction: null,
      metadata: {
        workflow: {
          kind: 'CONVERT',
          requestedAction: 'CONSULT_CONVERSION',
          patientId: 'patient-1',
          caseId: 'case-1',
          form: {
            name: 'Alice',
            email: 'alice@example.com',
            country: 'Singapore',
            conditionSummary: 'Revision rhinoplasty consultation',
            budget: 'USD 8000',
          },
        },
      },
    });
  });

  it('GET /api/v2/chatbot/history/{sessionId} drops legacy metadata nextAction overlays from public serialization', async () => {
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
    expect(json.messages[0]?.metadata.publicNextAction).toBeUndefined();
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).nextAction).toBeUndefined();
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>).publicNextAction).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} serializes canonical semantic metadata consistently from stored records', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-canonical-metadata',
        role: 'ASSISTANT',
        content: 'Please upload your reports first.',
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: {
          resolved_intent: 'REQUEST_DOC_UPLOAD',
          engagement_signal: 'DEEP_WORKFLOW',
          progression_signal: 'READY_TO_PROCEED',
          recommendation_signal: 'NONE',
          mentions_condition: true,
          mentions_doctor_or_hospital_need: false,
          public_next_action: 'REQUEST_DOC_UPLOAD',
          internal_next_action: 'REQUEST_DOC_UPLOAD',
          structuredOutput: {
            resolved_intent: 'REQUEST_DOC_UPLOAD',
            metadata: {
              engagement_signal: 'DEEP_WORKFLOW',
              progression_signal: 'READY_TO_PROCEED',
              recommendation_signal: 'NONE',
              mentions_condition: true,
              mentions_doctor_or_hospital_need: false,
              public_next_action: 'REQUEST_DOC_UPLOAD',
              internal_next_action: 'REQUEST_DOC_UPLOAD',
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
    expect(json.messages[0]?.metadata).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'NONE',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    });
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
    });
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>)).toMatchObject({
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'NONE',
      mentionsCondition: true,
      mentionsDoctorOrHospitalNeed: false,
    });
  });

  it('GET /api/v2/chatbot/history/{sessionId} keeps legacy intent-only assistant metadata strict in public serialization', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-legacy-intent-only',
        role: 'ASSISTANT',
        content: 'Please upload your reports first.',
        intent: 'CONSULT',
        metadata: {
          resolvedIntent: 'CONSULT',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          structuredOutput: {
            resolvedIntent: 'CONSULT',
            nextAction: 'REQUEST_DOC_UPLOAD',
            metadata: {
              resolvedIntent: 'CONSULT',
              publicNextAction: 'REQUEST_DOC_UPLOAD',
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
    expect(json.messages[0]?.intent).toBe('CONSULT');
    expect(json.messages[0]?.metadata.resolvedIntent).toBe('UNKNOWN');
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).resolvedIntent).toBe('UNKNOWN');
    expect(json.messages[0]?.metadata.publicNextAction).toBeUndefined();
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).nextAction).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} derives public intent from canonical resolvedIntent when stored intent drifts', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-drifted-public-intent',
        role: 'ASSISTANT',
        content: 'Please upload your reports first.',
        intent: 'UNKNOWN',
        resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: {
          resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
          publicNextAction: 'REQUEST_DOC_UPLOAD',
          structuredOutput: {
            intent: 'UNKNOWN',
            resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
            nextAction: 'REQUEST_DOC_UPLOAD',
            metadata: {
              resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
              publicNextAction: 'REQUEST_DOC_UPLOAD',
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
    expect(json.messages[0]?.intent).toBe('CONSULT');
  });

  it('GET /api/v2/chatbot/history/{sessionId} emits deterministic canonical fallback metadata and strips invalid raw semantic overlays', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-invalid-canonical-metadata',
        role: 'ASSISTANT',
        content: 'I can help with that.',
        nextAction: null,
        metadata: {
          resolved_intent: 'NOT_REAL',
          engagement_signal: 'INVALID',
          progression_signal: 'ALMOST_READY',
          recommendation_signal: 'NOW',
          next_action: 'FREEFORM_ACTION',
          public_next_action: 'FREEFORM_ACTION',
          internal_next_action: 'FREEFORM_ACTION',
          structuredOutput: {
            resolved_intent: 'NOT_REAL',
            next_action: 'FREEFORM_ACTION',
            metadata: {
              engagement_signal: 'INVALID',
              progression_signal: 'ALMOST_READY',
              recommendation_signal: 'NOW',
              public_next_action: 'FREEFORM_ACTION',
              internal_next_action: 'FREEFORM_ACTION',
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
    expect(json.messages[0]?.nextAction).toBeNull();
    expect(json.messages[0]?.metadata).toMatchObject({
      resolvedIntent: 'UNKNOWN',
      resolved_intent: 'UNKNOWN',
      engagementSignal: 'LIGHT_DISCOVERY',
      engagement_signal: 'LIGHT_DISCOVERY',
      progressionSignal: 'NONE',
      progression_signal: 'NONE',
      recommendationSignal: 'NONE',
      recommendation_signal: 'NONE',
      mentionsCondition: false,
      mentions_condition: false,
      mentionsDoctorOrHospitalNeed: false,
      mentions_doctor_or_hospital_need: false,
      semanticSignals: {
        resolvedIntent: 'UNKNOWN',
        engagementSignal: 'LIGHT_DISCOVERY',
        progressionSignal: 'NONE',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
      },
    });
    expect(json.messages[0]?.metadata.nextAction).toBeUndefined();
    expect(json.messages[0]?.metadata.publicNextAction).toBeUndefined();
    expect(json.messages[0]?.metadata.internalNextAction).toBeUndefined();
    expect(json.messages[0]?.metadata.next_action).toBeUndefined();
    expect(json.messages[0]?.metadata.public_next_action).toBeUndefined();
    expect(json.messages[0]?.metadata.internal_next_action).toBeUndefined();
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'UNKNOWN',
      resolved_intent: 'UNKNOWN',
    });
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>)).toMatchObject({
      engagementSignal: 'LIGHT_DISCOVERY',
      progressionSignal: 'NONE',
      recommendationSignal: 'NONE',
      mentionsCondition: false,
      mentionsDoctorOrHospitalNeed: false,
      semanticSignals: {
        resolvedIntent: 'UNKNOWN',
        engagementSignal: 'LIGHT_DISCOVERY',
        progressionSignal: 'NONE',
        recommendationSignal: 'NONE',
        mentionsCondition: false,
        mentionsDoctorOrHospitalNeed: false,
      },
    });
    expect(((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).nextAction)).toBeUndefined();
    expect(((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>).publicNextAction)).toBeUndefined();
    expect(((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>).internalNextAction)).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} strips nested semantic and action overlay keys from serialized metadata', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-nested-overlay-leak',
        role: 'ASSISTANT',
        content: 'Here is the package guidance.',
        nextAction: 'SHOW_PACKAGE',
        metadata: {
          resolvedIntent: 'ASK_PACKAGE_INFO',
          structuredOutput: {
            resolvedIntent: 'ASK_PACKAGE_INFO',
            metadata: {
              nested: {
                resolved_intent: 'NOT_REAL',
                public_next_action: 'FREEFORM_ACTION',
                child: {
                  engagement_signal: 'INVALID',
                  internal_next_action: 'FREEFORM_ACTION',
                },
              },
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
    const nested = ((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>).nested) as Record<string, unknown>;
    expect(nested.resolved_intent).toBeUndefined();
    expect(nested.public_next_action).toBeUndefined();
    expect((nested.child as Record<string, unknown>).engagement_signal).toBeUndefined();
    expect((nested.child as Record<string, unknown>).internal_next_action).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} canonicalizes legacy structured_output records through the strict structuredOutput envelope', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
      patientId: 'patient-1',
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'msg-legacy-structured-output',
        role: 'ASSISTANT',
        content: 'I can help with that.',
        nextAction: null,
        metadata: {
          structured_output: {
            resolved_intent: 'NOT_REAL',
            next_action: 'FREEFORM_ACTION',
            metadata: {
              engagement_signal: 'INVALID',
              public_next_action: 'FREEFORM_ACTION',
              nested: {
                internal_next_action: 'FREEFORM_ACTION',
              },
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
    expect((json.messages[0]?.metadata as Record<string, unknown>).structured_output).toBeUndefined();
    expect((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>)).toMatchObject({
      resolvedIntent: 'UNKNOWN',
      resolved_intent: 'UNKNOWN',
    });
    expect((((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>)).toMatchObject({
      engagementSignal: 'LIGHT_DISCOVERY',
      progressionSignal: 'NONE',
      recommendationSignal: 'NONE',
      mentionsCondition: false,
      mentionsDoctorOrHospitalNeed: false,
    });
    expect(((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).nextAction)).toBeUndefined();
    const structuredOutputMetadata = (((json.messages[0]?.metadata.structuredOutput as Record<string, unknown>).metadata) as Record<string, unknown>);
    expect(structuredOutputMetadata.publicNextAction).toBeUndefined();
    const nested = (structuredOutputMetadata.nested as Record<string, unknown>);
    expect(nested.internal_next_action).toBeUndefined();
  });

  it('GET /api/v2/chatbot/history/{sessionId} leaves legacy workflow requestedAction values raw in public metadata', async () => {
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
    expect(json.messages[0]?.nextAction).toBeNull();
    expect(((json.messages[0]?.metadata.workflow) as Record<string, unknown>).requestedAction).toBe('CONSULT_CONVERSION');
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
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-123');
  });

  it('POST /api/v2/chatbot/convert does not let legacy CONSULT_CONVERSION history override a canonical requestedAction', async () => {
    const secretHash = createHash('sha256').update('secret-123').digest('hex');
    mockServices.aiChatSessionRepo.findBySessionId.mockResolvedValue(makeSession({
      sessionSecretHash: secretHash,
    }));
    mockServices.aiChatMessageRepo.listBySession.mockResolvedValue([
      makeMessage({
        id: 'workflow-msg-legacy-convert-create-case',
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
        requestedAction: 'CREATE_CASE',
      }),
    });

    expect(res.status).toBe(200);
    const json = chatbotConvertResponseSchema.parse(await res.json());
    expect(json.caseId).toBe('case-1');
    expect(json.requestedAction).toBe('CREATE_CASE');
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
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('wrong-patient-session', 'beauty');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1', 'beauty');
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
    expect(mockServices.aiChatSessionRepo.attachPatient).toHaveBeenCalledWith('session-1', 'beauty', 'patient-1');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1', 'beauty');
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
    expect(mockServices.aiChatSessionRepo.updateStatus).toHaveBeenCalledWith('session-1', 'beauty', 'ESCALATED');
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenCalledOnce();
    expect(mockServices.aiChatMessageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'SYSTEM',
      nextAction: 'HUMAN_HANDOFF',
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
    expect(mockServices.aiChatSessionRepo.attachPatient).toHaveBeenCalledWith('session-1', 'beauty', 'patient-1');
    expect(mockServices.patientAuthService.createSessionToken).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(mockServices.patientAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1', 'beauty');
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
    expect(mockServices.aiChatSessionRepo.updateStatus).toHaveBeenCalledWith('session-1', 'beauty', 'ESCALATED');
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
