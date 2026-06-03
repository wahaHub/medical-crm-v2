import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, Message } from '@medical-crm/domain';
import type {
  IConversationRepository,
  IMessageRepository,
  TransactionRunner,
} from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { ResumeConversationAiUseCase } from '../src/use-cases/conversations/resume-conversation-ai.use-case.js';

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

function makeConversation(
  overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {},
): Conversation {
  return new Conversation({
    id: 'conv-1',
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

describe('ResumeConversationAiUseCase', () => {
  let conversationRepo: IConversationRepository;
  let messageRepo: IMessageRepository;
  let txRunner: TransactionRunner;
  let useCase: ResumeConversationAiUseCase;

  beforeEach(() => {
    conversationRepo = {
      findById: vi.fn().mockResolvedValue(makeConversation()),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn().mockImplementation(async (entity: Conversation) => entity),
    };
    messageRepo = {
      findById: vi.fn(),
      findByConversationId: vi.fn(),
      findByConversationClientMessageId: vi.fn(),
      findPendingReview: vi.fn(),
      createPendingAttachmentMessage: vi.fn(),
      claimDeliveryStatus: vi.fn(),
      updateDeliveryStatus: vi.fn(),
      updateMetadata: vi.fn(),
      save: vi.fn().mockImplementation(async (entity: Message) => entity),
      delete: vi.fn(),
    };
    txRunner = {
      run: vi.fn(async (fn) => fn({})),
    };
    useCase = new ResumeConversationAiUseCase(conversationRepo, messageRepo, txRunner);
  });

  it('restores AI, appends the resume notice once, and returns the broadcastable system notice', async () => {
    const result = await useCase.execute('conv-1', adminActor);

    expect(txRunner.run).toHaveBeenCalledOnce();
    expect(result.conversation.assistantMode).toBe('AI_ACTIVE');
    expect(result.resumeNotice).toMatchObject({
      senderId: null,
      senderRole: 'SYSTEM',
      messageType: 'SYSTEM',
      content: 'Medora AI 已重新接入，可继续为您提供初步协助',
    });
    expect(messageRepo.save).toHaveBeenCalledTimes(1);
  });

  it('appends the resume notice exactly once when concurrent restores race', async () => {
    const sharedConversation = makeConversation({
      assistantMode: 'HUMAN_TAKEOVER',
    });
    conversationRepo.findById = vi.fn(async () => sharedConversation);
    conversationRepo.save = vi.fn(async (entity: Conversation) => {
      sharedConversation.assistantMode = entity.assistantMode;
      sharedConversation.lastMessageId = entity.lastMessageId;
      sharedConversation.lastMessageAt = entity.lastMessageAt;
      sharedConversation.lastMessagePreview = entity.lastMessagePreview;
      sharedConversation.lastSenderId = entity.lastSenderId;
      return entity;
    });
    (conversationRepo as IConversationRepository & {
      compareAndSetAssistantMode: (
        id: string,
        fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
        toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
      ) => Promise<Conversation | null>;
    }).compareAndSetAssistantMode = vi.fn(async (_id, fromMode, toMode) => {
      if (sharedConversation.assistantMode !== fromMode) {
        return null;
      }
      sharedConversation.assistantMode = toMode;
      return makeConversation({
        ...sharedConversation,
        assistantMode: toMode,
      });
    });

    const [first, second] = await Promise.all([
      useCase.execute('conv-1', adminActor),
      useCase.execute('conv-1', adminActor),
    ]);

    expect([first.resumeNotice, second.resumeNotice].filter(Boolean)).toHaveLength(1);
    expect(messageRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not append duplicate resume notices when the conversation is already AI_ACTIVE', async () => {
    conversationRepo.findById = vi.fn().mockResolvedValue(makeConversation({
      assistantMode: 'AI_ACTIVE',
    }));

    const result = await useCase.execute('conv-1', adminActor);

    expect(result.conversation.assistantMode).toBe('AI_ACTIVE');
    expect(result.resumeNotice).toBeNull();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('does not persist a half-finished resume when the resume notice save fails', async () => {
    (conversationRepo as IConversationRepository & {
      compareAndSetAssistantMode: (
        id: string,
        fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
        toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
      ) => Promise<Conversation | null>;
    }).compareAndSetAssistantMode = vi.fn(async () => makeConversation({
      assistantMode: 'AI_ACTIVE',
    }));
    messageRepo.save = vi.fn().mockRejectedValue(new Error('failed to persist resume notice'));

    await expect(useCase.execute('conv-1', adminActor)).rejects.toThrow(
      'failed to persist resume notice',
    );

    expect(conversationRepo.save).not.toHaveBeenCalled();
  });
});
