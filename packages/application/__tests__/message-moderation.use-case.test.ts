import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPendingReviewUseCase } from '../src/use-cases/messages/list-pending-review.use-case.js';
import { ApproveMessageUseCase } from '../src/use-cases/messages/approve-message.use-case.js';
import { RejectMessageUseCase } from '../src/use-cases/messages/reject-message.use-case.js';
import { Message } from '@medical-crm/domain';
import type { IMessageRepository } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeMessage = (
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {},
) =>
  new Message({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'admin-1',
    content: 'Hello!',
    originalLanguage: 'en',
    translatedContent: null,
    messageType: 'TEXT',
    moderationStatus: 'REVIEW',
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

function makeMessageRepo(msg: Message | null = makeMessage()): IMessageRepository {
  return {
    findById: vi.fn().mockResolvedValue(msg),
    findByConversationId: vi.fn(),
    findPendingReview: vi.fn().mockResolvedValue(msg ? [msg] : []),
    save: vi.fn().mockImplementation((entity: Message) => Promise.resolve(entity)),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── ListPendingReviewUseCase ──────────────────────────────────────────────────

describe('ListPendingReviewUseCase', () => {
  it('ADMIN: returns MessageDTO[] from findPendingReview', async () => {
    const msg = makeMessage();
    const messageRepo = makeMessageRepo(msg);
    const useCase = new ListPendingReviewUseCase(messageRepo);

    const result = await useCase.execute(adminActor);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('msg-1');
    expect(result[0]!.moderationStatus).toBe('REVIEW');
    expect(typeof result[0]!.createdAt).toBe('string');
    expect(messageRepo.findPendingReview).toHaveBeenCalledOnce();
  });

  it('ADMIN: returns empty array when no pending messages', async () => {
    const messageRepo = makeMessageRepo(null);
    const useCase = new ListPendingReviewUseCase(messageRepo);

    const result = await useCase.execute(adminActor);

    expect(result).toHaveLength(0);
  });

  it('throws ForbiddenError for non-ADMIN (HOSPITAL)', async () => {
    const messageRepo = makeMessageRepo();
    const useCase = new ListPendingReviewUseCase(messageRepo);

    await expect(useCase.execute(hospitalActor)).rejects.toThrow(
      'Only ADMIN can list pending review messages',
    );
    expect(messageRepo.findPendingReview).not.toHaveBeenCalled();
  });
});

// ─── ApproveMessageUseCase ────────────────────────────────────────────────────

describe('ApproveMessageUseCase', () => {
  it('ADMIN: calls approve(), saves, and returns MessageDTO with ALLOWED status', async () => {
    const msg = makeMessage();
    const messageRepo = makeMessageRepo(msg);
    const useCase = new ApproveMessageUseCase(messageRepo);

    const result = await useCase.execute('msg-1', adminActor);

    expect(result.id).toBe('msg-1');
    expect(result.moderationStatus).toBe('ALLOWED');
    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(messageRepo.save).toHaveBeenCalledOnce();
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.moderationStatus).toBe('ALLOWED');
  });

  it('throws ForbiddenError for non-ADMIN (HOSPITAL)', async () => {
    const messageRepo = makeMessageRepo();
    const useCase = new ApproveMessageUseCase(messageRepo);

    await expect(useCase.execute('msg-1', hospitalActor)).rejects.toThrow(
      'Only ADMIN can approve messages',
    );
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when message does not exist', async () => {
    const messageRepo = makeMessageRepo(null);
    const useCase = new ApproveMessageUseCase(messageRepo);

    await expect(useCase.execute('missing-msg', adminActor)).rejects.toThrow(
      'Message missing-msg not found',
    );
    expect(messageRepo.save).not.toHaveBeenCalled();
  });
});

// ─── RejectMessageUseCase ─────────────────────────────────────────────────────

describe('RejectMessageUseCase', () => {
  it('ADMIN: calls reject(), saves, and returns MessageDTO with BLOCKED status', async () => {
    const msg = makeMessage();
    const messageRepo = makeMessageRepo(msg);
    const useCase = new RejectMessageUseCase(messageRepo);

    const result = await useCase.execute('msg-1', adminActor);

    expect(result.id).toBe('msg-1');
    expect(result.moderationStatus).toBe('BLOCKED');
    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(messageRepo.save).toHaveBeenCalledOnce();
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.moderationStatus).toBe('BLOCKED');
  });

  it('throws ForbiddenError for non-ADMIN (HOSPITAL)', async () => {
    const messageRepo = makeMessageRepo();
    const useCase = new RejectMessageUseCase(messageRepo);

    await expect(useCase.execute('msg-1', hospitalActor)).rejects.toThrow(
      'Only ADMIN can reject messages',
    );
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when message does not exist', async () => {
    const messageRepo = makeMessageRepo(null);
    const useCase = new RejectMessageUseCase(messageRepo);

    await expect(useCase.execute('missing-msg', adminActor)).rejects.toThrow(
      'Message missing-msg not found',
    );
    expect(messageRepo.save).not.toHaveBeenCalled();
  });
});
