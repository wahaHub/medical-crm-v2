import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessTranslationTasksUseCase } from '../src/use-cases/translations/process-translation-tasks.use-case.js';
import { TranslationTask } from '@medical-crm/domain';
import type {
  BatchTranslateResult,
  ITranslationTaskRepository,
  TranslationTask as TranslationTaskType,
} from '@medical-crm/domain';

function makeTask(overrides: Partial<TranslationTaskType> = {}): TranslationTaskType {
  return new TranslationTask({
    id: 'task-1',
    sourceDb: 'crm',
    entityType: 'hospital',
    entityId: 'hospital-1',
    chunkKey: 'overview',
    hospitalType: null,
    fieldsToTranslate: { title: '鼻子整形', description: '改变鼻子形状的手术。' },
    targetLanguages: ['en', 'ko'],
    sourceLanguage: null,
    targetLanguage: 'en',
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-01-10T09:00:00Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  });
}

function makeTaskRepo(tasks: TranslationTaskType[]): ITranslationTaskRepository {
  return {
    upsert: vi.fn(),
    pullPending: vi.fn().mockResolvedValue(tasks),
    markProcessing: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailedOrRetry: vi.fn().mockResolvedValue(undefined),
    resetForRetry: vi.fn().mockResolvedValue(undefined),
    findByEntity: vi.fn(),
  };
}

function makeTranslationService() {
  return {
    translateBatch: vi.fn<[], Promise<BatchTranslateResult>>(),
  };
}

function makeWritebackService() {
  return {
    writeback: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ProcessTranslationTasksUseCase', () => {
  let translationService: ReturnType<typeof makeTranslationService>;
  let writebackService: ReturnType<typeof makeWritebackService>;

  beforeEach(() => {
    translationService = makeTranslationService();
    writebackService = makeWritebackService();
  });

  it('passes exactly one explicit target language to OpenAI for each task', async () => {
    const tasks = [
      makeTask({
        id: 'task-en',
        chunkKey: 'overview',
        targetLanguage: 'en',
        targetLanguages: ['en', 'ko'],
      }),
      makeTask({
        id: 'task-ko',
        chunkKey: 'details',
        targetLanguage: 'ko',
        targetLanguages: ['en', 'ko'],
      }),
    ];
    const taskRepo = makeTaskRepo(tasks);
    translationService.translateBatch
      .mockResolvedValueOnce({
        detectedLanguage: 'zh',
        translations: { en: { title: 'Rhinoplasty' } },
      })
      .mockResolvedValueOnce({
        detectedLanguage: 'zh',
        translations: { ko: { title: '코 성형' } },
      });
    const useCase = new ProcessTranslationTasksUseCase(taskRepo, translationService, writebackService);

    const result = await useCase.execute();

    expect(translationService.translateBatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        targetLanguages: ['en'],
      }),
    );
    expect(translationService.translateBatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        targetLanguages: ['ko'],
      }),
    );
    expect(result).toEqual({ processed: 2, failed: 0 });
  });

  it('marks only the failing task for retry when another task still completes', async () => {
    const tasks = [
      makeTask({
        id: 'task-bad',
        chunkKey: 'overview',
        targetLanguage: 'en',
        targetLanguages: ['en', 'ko'],
      }),
      makeTask({
        id: 'task-good',
        chunkKey: 'details',
        targetLanguage: 'ko',
        targetLanguages: ['en', 'ko'],
      }),
    ];
    const taskRepo = makeTaskRepo(tasks);
    translationService.translateBatch
      .mockRejectedValueOnce(new SyntaxError('Unexpected token o in JSON at position 1'))
      .mockResolvedValueOnce({
        detectedLanguage: 'zh',
        translations: { ko: { title: '코 성형' } },
      });
    const useCase = new ProcessTranslationTasksUseCase(taskRepo, translationService, writebackService);

    const result = await useCase.execute();

    expect(taskRepo.markFailedOrRetry).toHaveBeenCalledWith(
      'task-bad',
      'Unexpected token o in JSON at position 1',
    );
    expect(taskRepo.markCompleted).toHaveBeenCalledWith('task-good', 'zh');
    expect(writebackService.writeback).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 1, failed: 1 });
  });
});
