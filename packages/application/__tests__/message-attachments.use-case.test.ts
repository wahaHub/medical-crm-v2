import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, Message } from '@medical-crm/domain';
import type {
  IConversationRepository,
  IMessageRepository,
  IStorageService,
} from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { ListMessagesUseCase } from '../src/use-cases/messages/list-messages.use-case.js';
import { GetMessageUseCase } from '../src/use-cases/messages/get-message.use-case.js';

const actor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const conversation = new Conversation({
  id: 'conv-1',
  caseId: 'case-1',
  category: 'HOSPITAL_PATIENT',
  title: 'Patient chat',
  hospitalId: 'hosp-1',
  lastMessageId: null,
  lastMessageAt: null,
  lastMessagePreview: null,
  lastSenderId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const message = new Message({
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'patient-1',
  content: '',
  originalLanguage: 'zh',
  translatedContent: 'Translated attachment summary',
  messageType: 'FILE',
  moderationStatus: 'ALLOWED',
  attachments: [
    {
      fileName: 'report.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      storageKey: 'messages/conv-1/report.pdf',
    },
  ],
  aiSummary: 'CT report uploaded',
  createdAt: new Date('2026-01-02T00:00:00Z'),
});

describe('message attachment DTO mapping', () => {
  let mockConversationRepo: IConversationRepository;
  let mockMessageRepo: IMessageRepository;
  let mockStorageService: IStorageService;

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn().mockResolvedValue(conversation),
      findMany: vi.fn(),
      save: vi.fn(),
    };

    mockMessageRepo = {
      findById: vi.fn().mockResolvedValue(message),
      findByConversationId: vi.fn().mockResolvedValue({
        data: [message],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      }),
      findPendingReview: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };

    mockStorageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn(),
      getSignedUrls: vi.fn().mockResolvedValue({
        'messages/conv-1/report.pdf': 'https://storage.example.com/messages/conv-1/report.pdf?sig=1',
      }),
    };
  });

  it('list messages resolves signed URLs and UI-friendly attachment aliases', async () => {
    const useCase = new ListMessagesUseCase(
      mockConversationRepo,
      mockMessageRepo,
      mockStorageService,
    );

    const result = await useCase.execute('conv-1', { page: 1, limit: 50 }, actor);

    expect(result.data[0]?.attachments).toEqual([
      expect.objectContaining({
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: 'messages/conv-1/report.pdf',
        name: 'report.pdf',
        size: 2048,
        type: 'application/pdf',
        url: 'https://storage.example.com/messages/conv-1/report.pdf?sig=1',
      }),
    ]);
    expect(mockStorageService.getSignedUrls).toHaveBeenCalledWith(['messages/conv-1/report.pdf']);
  });

  it('get message resolves signed URLs and UI-friendly attachment aliases', async () => {
    const useCase = new GetMessageUseCase(
      mockConversationRepo,
      mockMessageRepo,
      mockStorageService,
    );

    const result = await useCase.execute('conv-1', 'msg-1', actor);

    expect(result.attachments).toEqual([
      expect.objectContaining({
        fileName: 'report.pdf',
        url: 'https://storage.example.com/messages/conv-1/report.pdf?sig=1',
      }),
    ]);
    expect(mockStorageService.getSignedUrls).toHaveBeenCalledWith(['messages/conv-1/report.pdf']);
  });
});
