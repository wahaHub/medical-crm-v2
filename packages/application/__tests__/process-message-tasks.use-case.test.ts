import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessMessageTasksUseCase } from '../src/use-cases/messages/process-message-tasks.use-case.js';
import { Message } from '@medical-crm/domain';
import type {
  IMessageRepository,
  IMessageTaskQueue,
  ITranslationService,
  MessageTask,
} from '@medical-crm/domain';

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
    messageType: 'IMAGE',
    moderationStatus: 'ALLOWED',
    attachments: [],
    aiSummary: null,
    createdAt: new Date('2026-01-10T09:00:00Z'),
    ...overrides,
  });

const makeSummarizeTask = (overrides: Partial<MessageTask> = {}): MessageTask => ({
  id: 'task-1',
  messageId: 'msg-1',
  taskKind: 'SUMMARIZE',
  targetLanguage: null,
  retryCount: 0,
  ...overrides,
});

const makeTranslateTask = (overrides: Partial<MessageTask> = {}): MessageTask => ({
  id: 'task-2',
  messageId: 'msg-1',
  taskKind: 'TRANSLATE',
  targetLanguage: 'zh',
  retryCount: 0,
  ...overrides,
});

function makeTaskQueue(tasks: MessageTask[] = []): IMessageTaskQueue {
  return {
    enqueueTranslation: vi.fn().mockResolvedValue(undefined),
    enqueueSummarization: vi.fn().mockResolvedValue(undefined),
    pullPending: vi.fn().mockResolvedValue(tasks),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

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

// ─── ProcessMessageTasksUseCase ───────────────────────────────────────────────

describe('ProcessMessageTasksUseCase', () => {
  it('processes a SUMMARIZE task: calls summarizeMessage, sets aiSummary, saves, marks completed', async () => {
    const task = makeSummarizeTask();
    const msg = makeMessage();
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.pullPending).toHaveBeenCalledWith(10);
    expect(taskQueue.markProcessing).toHaveBeenCalledWith('task-1');
    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(translationService.summarizeMessage).toHaveBeenCalledWith(
      'Hello from hospital!',
      'IMAGE',
      'en',
    );
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.aiSummary).toBe('AI summary of the message');
    expect(taskQueue.markCompleted).toHaveBeenCalledWith('task-1');
    expect(result).toEqual({ processed: 1, failed: 0 });
  });

  it('processes a TRANSLATE task: calls translate with targetLang, sets translatedContent, saves, marks completed', async () => {
    const task = makeTranslateTask();
    const msg = makeMessage();
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.markProcessing).toHaveBeenCalledWith('task-2');
    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(translationService.translate).toHaveBeenCalledWith(
      'Hello from hospital!',
      'zh',
    );
    const savedMsg = (messageRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message;
    expect(savedMsg.translatedContent).toBe('translated text');
    expect(taskQueue.markCompleted).toHaveBeenCalledWith('task-2');
    expect(result).toEqual({ processed: 1, failed: 0 });
  });

  it('skips task with retryCount >= 3: marks failed without processing', async () => {
    const task = makeSummarizeTask({ retryCount: 3 });
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo();
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.markFailed).toHaveBeenCalledWith('task-1', 'Max retries exceeded');
    expect(taskQueue.markProcessing).not.toHaveBeenCalled();
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(translationService.summarizeMessage).not.toHaveBeenCalled();
    expect(taskQueue.markCompleted).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('marks failed if message not found', async () => {
    const task = makeSummarizeTask();
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo(null);
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.markProcessing).toHaveBeenCalledWith('task-1');
    expect(messageRepo.findById).toHaveBeenCalledWith('msg-1');
    expect(taskQueue.markFailed).toHaveBeenCalledWith('task-1', 'Message not found');
    expect(translationService.summarizeMessage).not.toHaveBeenCalled();
    expect(taskQueue.markCompleted).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('marks failed when translation service throws an error', async () => {
    const task = makeTranslateTask();
    const msg = makeMessage();
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    (translationService.translate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Translation API unavailable'),
    );
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.markFailed).toHaveBeenCalledWith('task-2', 'Translation API unavailable');
    expect(taskQueue.markCompleted).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('marks failed with "Unknown error" for non-Error throws', async () => {
    const task = makeSummarizeTask();
    const msg = makeMessage();
    const taskQueue = makeTaskQueue([task]);
    const messageRepo = makeMessageRepo(msg);
    const translationService = makeTranslationService();
    (translationService.summarizeMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      'some string error',
    );
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(taskQueue.markFailed).toHaveBeenCalledWith('task-1', 'Unknown error');
    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('returns correct { processed, failed } counts when processing mixed tasks', async () => {
    const tasks: MessageTask[] = [
      makeSummarizeTask({ id: 'task-a', messageId: 'msg-1', retryCount: 0 }),
      makeTranslateTask({ id: 'task-b', messageId: 'msg-2', retryCount: 3 }),
      makeSummarizeTask({ id: 'task-c', messageId: 'msg-3', retryCount: 0 }),
    ];
    const msg1 = makeMessage({ id: 'msg-1' });
    const msg3 = makeMessage({ id: 'msg-3' });

    const taskQueue = makeTaskQueue(tasks);
    const messageRepo: IMessageRepository = {
      findById: vi
        .fn()
        .mockResolvedValueOnce(msg1)
        .mockResolvedValueOnce(msg3),
      findByConversationId: vi.fn(),
      findPendingReview: vi.fn(),
      save: vi.fn().mockImplementation((entity: Message) => Promise.resolve(entity)),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    // task-a: processed (msg-1 found, summarize OK)
    // task-b: failed (retryCount >= 3)
    // task-c: processed (msg-3 found, summarize OK)
    expect(result).toEqual({ processed: 2, failed: 1 });
    expect(taskQueue.markCompleted).toHaveBeenCalledWith('task-a');
    expect(taskQueue.markFailed).toHaveBeenCalledWith('task-b', 'Max retries exceeded');
    expect(taskQueue.markCompleted).toHaveBeenCalledWith('task-c');
  });

  it('returns { processed: 0, failed: 0 } when no pending tasks', async () => {
    const taskQueue = makeTaskQueue([]);
    const messageRepo = makeMessageRepo();
    const translationService = makeTranslationService();
    const useCase = new ProcessMessageTasksUseCase(taskQueue, messageRepo, translationService);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(taskQueue.markProcessing).not.toHaveBeenCalled();
  });
});
