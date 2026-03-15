import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegenerateSummaryUseCase } from '../src/use-cases/messages/regenerate-summary.use-case.js';
import { RetranslateMessageUseCase } from '../src/use-cases/messages/retranslate-message.use-case.js';
import { Message } from '@medical-crm/domain';
import type { IMessageRepository, ITranslationService } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeMessage = (
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {},
) =>
  new Message({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'admin-1',
    content: 'Hello from hospital!',
    originalLanguage: 'en',
    translatedContent: null,
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

function makeMessageRepo(msg: Message | null = makeMessage()): IMessageRepository {
  return {
    findById: vi.fn().mockResolvedValue(msg),
    findByConversationId: vi.fn(),
    findPendingReview: vi.fn(),
    save: vi.fn().mockImplementation((entity: Message) => Promise.resolve(entity)),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTranslationService(): ITranslationService {
  return {
    translate: vi.fn().mockResolvedValue('translated text'),
    summarizeMessage: vi.fn().mockResolvedValue('AI summary of the message'),
  };
}

// ─── RegenerateSummaryUseCase ─────────────────────────────────────────────────

describe('RegenerateSummaryUseCase', () => {
  it('ADMIN: calls summarizeMessage, sets aiSummary, saves, returns DTO', async () => {
    const msg = makeMessage();
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    const useCase = new RegenerateSummaryUseCase(messageRepo, translationService);

    const result = await useCase.execute('msg-1', adminActor);

    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(translationService.summarizeMessage).toHaveBeenCalledWith(
      'Hello from hospital!',
      'TEXT',
      'en',
    );
    expect(messageRepo.save).toHaveBeenCalledOnce();
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.aiSummary).toBe('AI summary of the message');
    expect(result.id).toBe('msg-1');
    expect(result.aiSummary).toBe('AI summary of the message');
  });

  it('ADMIN: uses "en" as fallback when originalLanguage is null', async () => {
    const msg = makeMessage({ originalLanguage: null });
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    const useCase = new RegenerateSummaryUseCase(messageRepo, translationService);

    await useCase.execute('msg-1', adminActor);

    expect(translationService.summarizeMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'en',
    );
  });

  it('throws ForbiddenError for non-ADMIN (HOSPITAL)', async () => {
    const messageRepo = makeMessageRepo();
    const translationService = makeTranslationService();
    const useCase = new RegenerateSummaryUseCase(messageRepo, translationService);

    await expect(useCase.execute('msg-1', hospitalActor)).rejects.toThrow(
      'Only ADMIN can regenerate message summaries',
    );
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(translationService.summarizeMessage).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when message does not exist', async () => {
    const messageRepo = makeMessageRepo(null);
    const translationService = makeTranslationService();
    const useCase = new RegenerateSummaryUseCase(messageRepo, translationService);

    await expect(useCase.execute('missing-msg', adminActor)).rejects.toThrow(
      'Message missing-msg not found',
    );
    expect(translationService.summarizeMessage).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });
});

// ─── RetranslateMessageUseCase ────────────────────────────────────────────────

describe('RetranslateMessageUseCase', () => {
  it('ADMIN: calls translate with targetLang, sets translatedContent, saves, returns DTO', async () => {
    const msg = makeMessage();
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    const useCase = new RetranslateMessageUseCase(messageRepo, translationService);

    const result = await useCase.execute('msg-1', 'zh', adminActor);

    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(translationService.translate).toHaveBeenCalledWith(
      'Hello from hospital!',
      'zh',
    );
    expect(messageRepo.save).toHaveBeenCalledOnce();
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.translatedContent).toBe('translated text');
    expect(result.id).toBe('msg-1');
    expect(result.translatedContent).toBe('translated text');
  });

  it('throws ForbiddenError for non-ADMIN (HOSPITAL)', async () => {
    const messageRepo = makeMessageRepo();
    const translationService = makeTranslationService();
    const useCase = new RetranslateMessageUseCase(messageRepo, translationService);

    await expect(useCase.execute('msg-1', 'zh', hospitalActor)).rejects.toThrow(
      'Only ADMIN can retranslate messages',
    );
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(translationService.translate).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when message does not exist', async () => {
    const messageRepo = makeMessageRepo(null);
    const translationService = makeTranslationService();
    const useCase = new RetranslateMessageUseCase(messageRepo, translationService);

    await expect(useCase.execute('missing-msg', 'zh', adminActor)).rejects.toThrow(
      'Message missing-msg not found',
    );
    expect(translationService.translate).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
  });
});
