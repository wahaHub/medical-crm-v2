import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, Message } from '@medical-crm/domain';
import type {
  IAiChatSessionRepository,
  IConversationRepository,
  IMessageRepository,
} from '@medical-crm/domain';
import { HandlePatientChatEventUseCase } from '../src/use-cases/patient-chat/handle-patient-chat-event.use-case.js';
import type { GetPatientSessionDetailUseCase } from '../src/use-cases/patient-dashboard/get-patient-session-detail.use-case.js';

function makeConversation(): Conversation {
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
    assistantMode: 'AI_ACTIVE',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  });
}

function makeUploadMessage(overrides: Partial<ConstructorParameters<typeof Message>[0]> = {}): Message {
  return new Message({
    id: 'msg-upload-1',
    conversationId: 'conv-admin',
    clientMessageId: 'client-upload-1',
    senderId: 'patient-1',
    senderRole: 'PATIENT',
    senderName: null,
    content: 'Uploading medical records...',
    originalLanguage: 'en',
    translatedContent: null,
    messageType: 'FILE',
    moderationStatus: 'ALLOWED',
    attachments: [{
      fileName: 'report.pdf',
      fileSize: 123,
      mimeType: 'application/pdf',
      storageKey: 'message-attachments/report.pdf',
    }],
    deliveryStatus: 'uploading',
    metadata: { uploadStatus: 'uploading' },
    aiSummary: null,
    createdAt: new Date('2026-06-01T00:01:00Z'),
    ...overrides,
  });
}

describe('HandlePatientChatEventUseCase', () => {
  let conversation: Conversation;
  let conversationRepo: IConversationRepository;
  let messageRepo: IMessageRepository;
  let aiChatSessionRepo: IAiChatSessionRepository;
  let getPatientSessionDetail: Pick<GetPatientSessionDetailUseCase, 'execute'>;
  let uploadDocument: { execute: ReturnType<typeof vi.fn> };
  let useCase: HandlePatientChatEventUseCase;

  beforeEach(() => {
    conversation = makeConversation();
    conversationRepo = {
      findById: vi.fn().mockResolvedValue(conversation),
      findMany: vi.fn(),
      findByPatientId: vi.fn().mockResolvedValue([conversation]),
      findOrCreateAdminPatientConversation: vi.fn(),
      findOrCreateHospitalPatientConversation: vi.fn(),
      save: vi.fn().mockImplementation(async (entity: Conversation) => entity),
    };
    messageRepo = {
      findById: vi.fn(),
      findByConversationId: vi.fn(),
      findByConversationClientMessageId: vi.fn(),
      findPendingReview: vi.fn(),
      createPendingAttachmentMessage: vi.fn(),
      claimDeliveryStatus: vi.fn(),
      updateDeliveryStatus: vi.fn().mockImplementation(async (_messageId, status, metadataPatch) =>
        makeUploadMessage({ deliveryStatus: status, metadata: { ...metadataPatch } }),
      ),
      updateMetadata: vi.fn(),
      save: vi.fn().mockImplementation(async (message: Message) => message),
      delete: vi.fn(),
    };
    aiChatSessionRepo = {
      findBySessionId: vi.fn().mockResolvedValue(null),
      findByDifyConversationId: vi.fn(),
      save: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      updateAutomationMode: vi.fn(),
      patchStatus: vi.fn(),
    };
    getPatientSessionDetail = {
      execute: vi.fn().mockResolvedValue({ sessionId: 'widget-chat:patient-1:case-1' }),
    };
    uploadDocument = {
      execute: vi.fn().mockResolvedValue({ documentId: 'doc-1' }),
    };
    useCase = new HandlePatientChatEventUseCase(
      conversationRepo,
      messageRepo,
      aiChatSessionRepo,
      getPatientSessionDetail as GetPatientSessionDetailUseCase,
      uploadDocument,
    );
  });

  it('handles contact advisor as one backend-owned handoff message', async () => {
    await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      eventType: 'ACTION_SELECTED',
      actionKey: 'CONTACT_ADVISOR',
      locale: 'zh',
    });

    const savedMessages = vi.mocked(messageRepo.save).mock.calls.map(([message]) => message);
    expect(savedMessages.map((message) => message.content)).toEqual([
      '已选择: 联系顾问',
      '您的请求已转交顾问团队，顾问会继续跟进。',
    ]);
    expect(conversation.assistantMode).toBe('HUMAN_TAKEOVER');
    expect(aiChatSessionRepo.updateAutomationMode).toHaveBeenCalledWith(
      'widget-chat:patient-1:case-1',
      'beauty',
      'human',
    );
  });

  it('does not create a document when upload completion cannot claim the pending message', async () => {
    const uploadMessage = makeUploadMessage();
    vi.mocked(messageRepo.findByConversationClientMessageId).mockResolvedValue(uploadMessage);
    vi.mocked(messageRepo.claimDeliveryStatus).mockResolvedValue(null);

    await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      eventType: 'ATTACHMENT_UPLOAD_COMPLETED',
      clientMessageId: 'client-upload-1',
      locale: 'en',
      payload: {
        attachments: uploadMessage.attachments,
      },
    });

    expect(messageRepo.claimDeliveryStatus).toHaveBeenCalledWith(
      'msg-upload-1',
      ['uploading', 'pending'],
      'pending',
      expect.objectContaining({ uploadStatus: 'processing' }),
    );
    expect(uploadDocument.execute).not.toHaveBeenCalled();
    expect(messageRepo.updateDeliveryStatus).not.toHaveBeenCalled();
  });

  it('claims upload completion before creating the case document', async () => {
    const uploadMessage = makeUploadMessage();
    vi.mocked(messageRepo.findByConversationClientMessageId).mockResolvedValue(uploadMessage);
    vi.mocked(messageRepo.claimDeliveryStatus).mockResolvedValue(makeUploadMessage({
      deliveryStatus: 'pending',
      metadata: { uploadStatus: 'processing' },
    }));

    await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      eventType: 'ATTACHMENT_UPLOAD_COMPLETED',
      clientMessageId: 'client-upload-1',
      locale: 'en',
      payload: {
        attachments: uploadMessage.attachments,
      },
    });

    expect(uploadDocument.execute).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'case-1',
      storageKey: 'message-attachments/report.pdf',
    }), expect.objectContaining({
      role: 'PATIENT',
      userId: 'patient-1',
    }));
    expect(messageRepo.updateDeliveryStatus).toHaveBeenCalledWith(
      'msg-upload-1',
      'sent',
      expect.objectContaining({
        documentId: 'doc-1',
        uploadStatus: 'uploaded',
      }),
      undefined,
    );
  });

  it('does not duplicate advisor handoff on repeated action events with the same client message id', async () => {
    const existingAction = new Message({
      id: 'msg-existing-action',
      conversationId: 'conv-admin',
      clientMessageId: 'mechanical-action:widget-chat:patient-1:case-1:CONTACT_ADVISOR',
      senderId: 'patient-1',
      senderRole: 'PATIENT',
      senderName: null,
      content: '已选择: 联系顾问',
      originalLanguage: 'zh',
      translatedContent: null,
      messageType: 'TEXT',
      moderationStatus: 'ALLOWED',
      attachments: [],
      deliveryStatus: 'sent',
      metadata: { eventType: 'ACTION_SELECTED', actionKey: 'CONTACT_ADVISOR' },
      aiSummary: null,
      createdAt: new Date('2026-06-01T00:02:00Z'),
    });
    vi.mocked(messageRepo.findByConversationClientMessageId).mockResolvedValue(existingAction);

    await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      eventType: 'ACTION_SELECTED',
      actionKey: 'CONTACT_ADVISOR',
      clientMessageId: 'mechanical-action:widget-chat:patient-1:case-1:CONTACT_ADVISOR',
      locale: 'zh',
    });

    expect(messageRepo.save).not.toHaveBeenCalled();
    expect(conversation.assistantMode).toBe('HUMAN_TAKEOVER');
    expect(aiChatSessionRepo.updateAutomationMode).toHaveBeenCalledWith(
      'widget-chat:patient-1:case-1',
      'beauty',
      'human',
    );
  });
});
