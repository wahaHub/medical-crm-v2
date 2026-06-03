import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatMessage, AiChatSession, Conversation, Message } from '@medical-crm/domain';
import type {
  IAiChatMessageRepository,
  IAiChatSessionRepository,
  IConversationRepository,
  IHospitalRepository,
  IMessageRepository,
  IStorageService,
} from '@medical-crm/domain';
import { GetPatientSessionDetailUseCase } from '../src/use-cases/patient-dashboard/get-patient-session-detail.use-case.js';

function makeConversation(
  overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {},
): Conversation {
  return new Conversation({
    id: 'conv-admin',
    caseId: 'case-1',
    category: 'ADMIN_PATIENT',
    title: null,
    hospitalId: null,
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    assistantMode: 'HUMAN_TAKEOVER',
    createdAt: new Date('2026-04-18T00:00:00Z'),
    updatedAt: new Date('2026-04-18T00:00:00Z'),
    ...overrides,
  });
}

function makeFormalMessage(
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {},
): Message {
  return new Message({
    id: 'msg-formal',
    conversationId: 'conv-admin',
    senderId: 'admin-1',
    senderRole: 'ADMIN',
    senderName: 'Medora Care Team',
    content: 'A human specialist is here.',
    originalLanguage: 'en',
    translatedContent: null,
    messageType: 'TEXT',
    moderationStatus: 'ALLOWED',
    attachments: [],
    aiSummary: null,
    createdAt: new Date('2026-04-18T00:01:00Z'),
    ...overrides,
  });
}

function makeAiMessage(
  overrides: Partial<ConstructorParameters<typeof AiChatMessage>[0]> = {},
): AiChatMessage {
  return new AiChatMessage({
    id: 'msg-ai',
    sessionId: 'ai-session-db-1',
    role: 'ASSISTANT',
    content: 'AI guidance',
    intent: null,
    resolvedIntent: null,
    riskLevel: null,
    canAnswer: true,
    nextAction: null,
    citations: [],
    metadata: {},
    createdAt: new Date('2026-04-18T00:00:30Z'),
    ...overrides,
  });
}

describe('GetPatientSessionDetailUseCase', () => {
  let conversationRepo: IConversationRepository;
  let messageRepo: IMessageRepository;
  let aiChatSessionRepo: IAiChatSessionRepository;
  let aiChatMessageRepo: IAiChatMessageRepository;
  let storageService: IStorageService;
  let hospitalRepo: IHospitalRepository;
  let useCase: GetPatientSessionDetailUseCase;

  beforeEach(() => {
    conversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByPatientId: vi.fn().mockResolvedValue([]),
      findOrCreateAdminPatientConversation: vi.fn(),
      findOrCreateHospitalPatientConversation: vi.fn(),
      save: vi.fn(),
    };
    messageRepo = {
      findById: vi.fn(),
      findByConversationClientMessageId: vi.fn(),
      findByConversationId: vi.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasMore: false,
      }),
      findPendingReview: vi.fn(),
      createPendingAttachmentMessage: vi.fn(),
      claimDeliveryStatus: vi.fn(),
      updateDeliveryStatus: vi.fn(),
      updateMetadata: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    aiChatSessionRepo = {
      findBySessionId: vi.fn().mockResolvedValue(null),
      findByDifyConversationId: vi.fn(),
      save: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      patchStatus: vi.fn(),
    };
    aiChatMessageRepo = {
      create: vi.fn(),
      listBySession: vi.fn().mockResolvedValue([]),
      listRecentBySession: vi.fn(),
      updateMessage: vi.fn(),
      updateWritebackMetadata: vi.fn(),
      deleteById: vi.fn(),
    };
    storageService = {
      getSignedUrls: vi.fn().mockResolvedValue({}),
    } as unknown as IStorageService;
    hospitalRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findMatchingHospitals: vi.fn(),
    };

    useCase = new GetPatientSessionDetailUseCase(
      conversationRepo,
      messageRepo,
      aiChatSessionRepo,
      aiChatMessageRepo,
      storageService,
      hospitalRepo,
    );
  });

  it('returns a merged care-team timeline with deterministic ordering', async () => {
    vi.mocked(conversationRepo.findByPatientId).mockResolvedValue([
      makeConversation({
        id: 'conv-admin',
        category: 'ADMIN_PATIENT',
        assistantMode: 'HUMAN_TAKEOVER',
      }),
    ]);
    vi.mocked(messageRepo.findByConversationId).mockResolvedValue({
      data: [makeFormalMessage()],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasMore: false,
    });
    vi.mocked(aiChatSessionRepo.findBySessionId).mockResolvedValue(new AiChatSession({
      id: 'ai-session-db-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-18T00:00:00Z'),
      updatedAt: new Date('2026-04-18T00:00:00Z'),
    }));
    vi.mocked(aiChatMessageRepo.listBySession).mockResolvedValue([
      makeAiMessage(),
    ]);

    const result = await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      limit: 50,
    });

    expect(result.sessionId).toBe('widget-chat:patient-1:case-1');
    expect(result.type).toBe('CARE_TEAM');
    expect(result.chatAuthority).toBe('HUMAN_TAKEOVER');
    expect(result.data.map((message) => [message.id, message.source])).toEqual([
      ['msg-ai', 'CHATBOT'],
      ['msg-formal', 'FORMAL'],
    ]);
  });

  it('returns only the hospital-local formal thread for hospital sessions', async () => {
    vi.mocked(conversationRepo.findByPatientId).mockResolvedValue([
      makeConversation({
        id: 'conv-admin',
        category: 'ADMIN_PATIENT',
        assistantMode: 'HUMAN_TAKEOVER',
      }),
      makeConversation({
        id: 'conv-hospital',
        category: 'HOSPITAL_PATIENT',
        hospitalId: 'hospital-1',
        assistantMode: 'AI_ACTIVE',
      }),
    ]);
    vi.mocked(messageRepo.findByConversationId).mockResolvedValue({
      data: [makeFormalMessage({
        id: 'msg-hospital',
        conversationId: 'conv-hospital',
        senderId: 'hospital-user-1',
        senderRole: 'HOSPITAL',
        senderName: 'Seoul Aesthetic',
        content: 'Doctor reply',
      })],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasMore: false,
    });
    vi.mocked(hospitalRepo.findById).mockResolvedValue({
      id: 'hospital-1',
      name: 'Seoul Aesthetic',
      status: 'ACTIVE',
      type: 'COSMETIC',
    });

    const result = await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'hospital:hospital-1:case-1',
      site: 'beauty',
      limit: 50,
    });

    expect(result.type).toBe('HOSPITAL');
    expect(result.title).toBe('Seoul Aesthetic');
    expect(result.chatAuthority).toBe('HUMAN_TAKEOVER');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'msg-hospital',
      source: 'FORMAL',
      senderRole: 'HOSPITAL',
    });
  });

  it('keeps upload records available after non-file formal messages', async () => {
    vi.mocked(conversationRepo.findByPatientId).mockResolvedValue([
      makeConversation({
        id: 'conv-admin',
        category: 'ADMIN_PATIENT',
        assistantMode: 'AI_ACTIVE',
      }),
    ]);
    vi.mocked(messageRepo.findByConversationId).mockResolvedValue({
      data: [makeFormalMessage({
        id: 'msg-upload-action',
        senderRole: 'PATIENT',
        messageType: 'TEXT',
        deliveryStatus: 'sent',
        attachments: [],
        metadata: {
          eventType: 'ACTION_SELECTED',
          actionKey: 'UPLOAD_RECORDS',
        },
      })],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasMore: false,
    });
    vi.mocked(aiChatSessionRepo.findBySessionId).mockResolvedValue(new AiChatSession({
      id: 'ai-session-db-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
      automationMode: 'mechanical',
      statusSnapshot: {
        formStatus: 'COMPLETED',
        processExplained: true,
        supportingDocuments: [],
      },
      createdAt: new Date('2026-04-18T00:00:00Z'),
      updatedAt: new Date('2026-04-18T00:00:00Z'),
    }));

    const result = await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      limit: 50,
    });

    expect(result.chatState?.botMode).toBe('mechanical');
    expect(result.chatState?.availableActions.map((action) => action.id)).toContain('UPLOAD_RECORDS');
  });

  it('hides upload records after a completed file attachment message', async () => {
    vi.mocked(conversationRepo.findByPatientId).mockResolvedValue([
      makeConversation({
        id: 'conv-admin',
        category: 'ADMIN_PATIENT',
        assistantMode: 'AI_ACTIVE',
      }),
    ]);
    vi.mocked(messageRepo.findByConversationId).mockResolvedValue({
      data: [makeFormalMessage({
        id: 'msg-uploaded-file',
        senderRole: 'PATIENT',
        messageType: 'FILE',
        deliveryStatus: 'sent',
        attachments: [{
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 1234,
          storageKey: 'message-attachments/report.pdf',
        }],
      })],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasMore: false,
    });
    vi.mocked(aiChatSessionRepo.findBySessionId).mockResolvedValue(new AiChatSession({
      id: 'ai-session-db-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      sessionSecretHash: null,
      difyConversationId: null,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
      automationMode: 'mechanical',
      createdAt: new Date('2026-04-18T00:00:00Z'),
      updatedAt: new Date('2026-04-18T00:00:00Z'),
    }));

    const result = await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      limit: 50,
    });

    expect(result.chatState?.botMode).toBe('mechanical');
    expect(result.chatState?.availableActions.map((action) => action.id)).not.toContain('UPLOAD_RECORDS');
  });
});
