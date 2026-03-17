import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListMessagesUseCase } from '../src/use-cases/messages/list-messages.use-case.js';
import { GetMessageUseCase } from '../src/use-cases/messages/get-message.use-case.js';
import { UpdateMessageUseCase } from '../src/use-cases/messages/update-message.use-case.js';
import { DeleteMessageUseCase } from '../src/use-cases/messages/delete-message.use-case.js';
import { Conversation, Message } from '@medical-crm/domain';
import type { IConversationRepository, IMessageRepository, IStorageService } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeConversation = (
  overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {},
) =>
  new Conversation({
    id: 'conv-1',
    caseId: 'case-1',
    category: 'ADMIN_HOSPITAL',
    title: 'Test Conversation',
    hospitalId: 'hosp-1',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-10T08:00:00Z'),
    ...overrides,
  });

const makeMessage = (
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {},
) =>
  new Message({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'admin-1',
    content: 'Hello!',
    originalLanguage: 'en',
    translatedContent: 'Hola!',
    messageType: 'TEXT',
    moderationStatus: 'ALLOWED',
    attachments: [],
    aiSummary: null,
    createdAt: new Date('2026-01-10T09:00:00Z'),
    ...overrides,
  });

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hosp-user-1',
  email: 'hosp@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const otherHospitalActor: Actor = {
  userId: 'hosp-user-2',
  email: 'hosp2@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-2',
};

const makePaginatedResult = (messages: Message[]) => ({
  data: messages,
  total: messages.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasMore: false,
});

// ─── Shared mock factories ─────────────────────────────────────────────────────

function makeRepos(
  conv = makeConversation(),
  msg: Message | null = makeMessage(),
) {
  const mockConversationRepo: IConversationRepository = {
    findById: vi.fn().mockResolvedValue(conv),
    findMany: vi.fn(),
    save: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
  };

  const mockMessageRepo: IMessageRepository = {
    findById: vi.fn().mockResolvedValue(msg),
    findByConversationId: vi.fn().mockResolvedValue(makePaginatedResult(msg ? [msg] : [])),
    findPendingReview: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity: Message) => Promise.resolve(entity)),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  return { mockConversationRepo, mockMessageRepo };
}

function makeStorage(): IStorageService {
  return {
    createPresignedUpload: vi.fn(),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn().mockResolvedValue({}),
  };
}

// ─── ListMessagesUseCase ───────────────────────────────────────────────────────

describe('ListMessagesUseCase', () => {
  it('ADMIN: returns paginated MessageDTOs', async () => {
    const msg = makeMessage();
    const { mockConversationRepo, mockMessageRepo } = makeRepos(makeConversation(), msg);
    const useCase = new ListMessagesUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    const result = await useCase.execute('conv-1', { page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data[0]!.id).toBe('msg-1');
    expect(result.data[0]!.content).toBe('Hello!');
    expect(typeof result.data[0]!.createdAt).toBe('string');
    expect(mockMessageRepo.findByConversationId).toHaveBeenCalledWith(
      'conv-1',
      { page: 1, limit: 20 },
    );
  });

  it('HOSPITAL: can list messages in own conversation', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new ListMessagesUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    const result = await useCase.execute('conv-1', { page: 1, limit: 20 }, hospitalActor);

    expect(result.data).toHaveLength(1);
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new ListMessagesUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('missing-conv', { page: 1, limit: 20 }, adminActor),
    ).rejects.toThrow('Conversation missing-conv not found');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new ListMessagesUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('conv-1', { page: 1, limit: 20 }, otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to list ADMIN_PATIENT conversation', async () => {
    const conv = makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' });
    const { mockConversationRepo, mockMessageRepo } = makeRepos(conv);
    const useCase = new ListMessagesUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('conv-1', { page: 1, limit: 20 }, hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });
});

// ─── GetMessageUseCase ─────────────────────────────────────────────────────────

describe('GetMessageUseCase', () => {
  it('ADMIN: returns a single MessageDTO', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    const result = await useCase.execute('conv-1', 'msg-1', adminActor);

    expect(result.id).toBe('msg-1');
    expect(result.content).toBe('Hello!');
    expect(result.messageType).toBe('TEXT');
    expect(result.moderationStatus).toBe('ALLOWED');
    expect(typeof result.createdAt).toBe('string');
    expect(result.createdAt).toBe('2026-01-10T09:00:00.000Z');
    expect(mockMessageRepo.findById).toHaveBeenCalledWith('msg-1');
  });

  it('HOSPITAL: can get a message from own conversation', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    const result = await useCase.execute('conv-1', 'msg-1', hospitalActor);

    expect(result.id).toBe('msg-1');
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('no-conv', 'msg-1', adminActor),
    ).rejects.toThrow('Conversation no-conv not found');
  });

  it('throws NotFoundError if message does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockMessageRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('conv-1', 'no-msg', adminActor),
    ).rejects.toThrow('Message no-msg not found');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('conv-1', 'msg-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to get message in ADMIN_PATIENT conversation', async () => {
    const conv = makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' });
    const { mockConversationRepo, mockMessageRepo } = makeRepos(conv);
    const useCase = new GetMessageUseCase(mockConversationRepo, mockMessageRepo, makeStorage());

    await expect(
      useCase.execute('conv-1', 'msg-1', hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });
});

// ─── UpdateMessageUseCase ──────────────────────────────────────────────────────

describe('UpdateMessageUseCase', () => {
  it('ADMIN: updates content, clears translatedContent, returns updated MessageDTO', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    const result = await useCase.execute(
      'conv-1',
      'msg-1',
      { content: 'Updated content' },
      adminActor,
    );

    expect(result.content).toBe('Updated content');
    expect(result.translatedContent).toBeNull();
    expect(mockMessageRepo.save).toHaveBeenCalledOnce();
    const savedMsg = (mockMessageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.content).toBe('Updated content');
    expect(savedMsg.translatedContent).toBeNull();
  });

  it('HOSPITAL: can update message in own non-ADMIN_PATIENT conversation', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    const result = await useCase.execute(
      'conv-1',
      'msg-1',
      { content: 'Hospital edit' },
      hospitalActor,
    );

    expect(result.content).toBe('Hospital edit');
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('no-conv', 'msg-1', { content: 'X' }, adminActor),
    ).rejects.toThrow('Conversation no-conv not found');
  });

  it('throws NotFoundError if message does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockMessageRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'no-msg', { content: 'X' }, adminActor),
    ).rejects.toThrow('Message no-msg not found');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'msg-1', { content: 'X' }, otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to update message in ADMIN_PATIENT conversation', async () => {
    const conv = makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' });
    const { mockConversationRepo, mockMessageRepo } = makeRepos(conv);
    const useCase = new UpdateMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'msg-1', { content: 'X' }, hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });
});

// ─── DeleteMessageUseCase ──────────────────────────────────────────────────────

describe('DeleteMessageUseCase', () => {
  it('ADMIN: deletes a message successfully', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await useCase.execute('conv-1', 'msg-1', adminActor);

    expect(mockMessageRepo.delete).toHaveBeenCalledWith('msg-1');
  });

  it('returns void on successful deletion', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    const result = await useCase.execute('conv-1', 'msg-1', adminActor);

    expect(result).toBeUndefined();
  });

  it('HOSPITAL: can delete message in own non-ADMIN_PATIENT conversation', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await useCase.execute('conv-1', 'msg-1', hospitalActor);

    expect(mockMessageRepo.delete).toHaveBeenCalledWith('msg-1');
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('no-conv', 'msg-1', adminActor),
    ).rejects.toThrow('Conversation no-conv not found');
  });

  it('throws NotFoundError if message does not exist', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockMessageRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'no-msg', adminActor),
    ).rejects.toThrow('Message no-msg not found');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'msg-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to delete message in ADMIN_PATIENT conversation', async () => {
    const conv = makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' });
    const { mockConversationRepo, mockMessageRepo } = makeRepos(conv);
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'msg-1', hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('does NOT call delete if message is not found', async () => {
    const { mockConversationRepo, mockMessageRepo } = makeRepos();
    mockMessageRepo.findById = vi.fn().mockResolvedValue(null);
    const useCase = new DeleteMessageUseCase(mockConversationRepo, mockMessageRepo);

    await expect(
      useCase.execute('conv-1', 'no-msg', adminActor),
    ).rejects.toThrow();

    expect(mockMessageRepo.delete).not.toHaveBeenCalled();
  });
});
