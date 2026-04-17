import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTranslationStatusUseCase } from '../src/use-cases/translations/get-translation-status.use-case.js';
import { RetryTranslationUseCase } from '../src/use-cases/translations/retry-translation.use-case.js';
import type { ITranslationTaskRepository } from '@medical-crm/domain';
import { TranslationTask, type TranslationTaskProps } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

function makeTask(overrides: Partial<TranslationTaskProps> = {}): TranslationTask {
  return new TranslationTask({
    id: 'task-1',
    sourceDb: 'crm',
    entityType: 'hospital',
    entityId: 'entity-1',
    chunkKey: 'default',
    hospitalType: null,
    fieldsToTranslate: { name: 'Hospital' },
    targetLanguages: ['en'],
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  });
}

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

describe('translation task control-plane use cases', () => {
  let mockTaskRepo: ITranslationTaskRepository;
  let getStatus: GetTranslationStatusUseCase;
  let retryTranslation: RetryTranslationUseCase;

  beforeEach(() => {
    mockTaskRepo = {
      upsert: vi.fn(),
      pullPending: vi.fn(),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markFailedOrRetry: vi.fn(),
      resetForRetry: vi.fn().mockResolvedValue(undefined),
      findByEntity: vi.fn(),
    } as unknown as ITranslationTaskRepository;

    getStatus = new GetTranslationStatusUseCase(mockTaskRepo);
    retryTranslation = new RetryTranslationUseCase(mockTaskRepo);
  });

  it('aggregates status, retryCount, errorMessage, and detectedLanguage across sibling tasks', async () => {
    mockTaskRepo.findByEntity = vi.fn().mockResolvedValue([
      makeTask({
        id: 'task-processing',
        status: 'processing',
        retryCount: 1,
        detectedLanguage: 'zh',
      }),
      makeTask({
        id: 'task-pending',
        status: 'pending',
        retryCount: 3,
        detectedLanguage: 'zh',
      }),
      makeTask({
        id: 'task-failed',
        status: 'failed',
        retryCount: 2,
        errorMessage: 'translate-me',
        detectedLanguage: 'zh',
      }),
      makeTask({
        id: 'task-completed',
        status: 'completed',
        retryCount: 0,
        detectedLanguage: 'zh',
      }),
    ]);

    const result = await getStatus.execute('crm', 'hospital', 'entity-1', adminActor);

    expect(result).toEqual({
      status: 'processing',
      retryCount: 3,
      errorMessage: null,
      detectedLanguage: 'zh',
    });
  });

  it('returns failed status with a useful failed sibling message when no tasks are active', async () => {
    mockTaskRepo.findByEntity = vi.fn().mockResolvedValue([
      makeTask({
        id: 'task-completed',
        status: 'completed',
        retryCount: 0,
        detectedLanguage: 'en',
      }),
      makeTask({
        id: 'task-failed',
        status: 'failed',
        retryCount: 2,
        errorMessage: 'translation failed',
        detectedLanguage: 'en',
      }),
    ]);

    const result = await getStatus.execute('crm', 'hospital', 'entity-1', adminActor);

    expect(result).toEqual({
      status: 'failed',
      retryCount: 2,
      errorMessage: 'translation failed',
      detectedLanguage: 'en',
    });
  });

  it('returns null detectedLanguage when sibling tasks disagree', async () => {
    mockTaskRepo.findByEntity = vi.fn().mockResolvedValue([
      makeTask({
        id: 'task-1',
        status: 'completed',
        detectedLanguage: 'en',
      }),
      makeTask({
        id: 'task-2',
        status: 'completed',
        detectedLanguage: 'zh',
      }),
    ]);

    const result = await getStatus.execute('crm', 'hospital', 'entity-1', adminActor);

    expect(result?.detectedLanguage).toBeNull();
  });

  it('resets every failed sibling task for the entity', async () => {
    mockTaskRepo.findByEntity = vi.fn().mockResolvedValue([
      makeTask({
        id: 'task-pending',
        status: 'pending',
      }),
      makeTask({
        id: 'task-failed-1',
        status: 'failed',
        retryCount: 1,
      }),
      makeTask({
        id: 'task-failed-2',
        status: 'failed',
        retryCount: 2,
      }),
      makeTask({
        id: 'task-completed',
        status: 'completed',
      }),
    ]);

    await retryTranslation.execute(
      { sourceDb: 'crm', entityType: 'hospital', entityId: 'entity-1' },
      adminActor,
    );

    expect(mockTaskRepo.resetForRetry).toHaveBeenCalledTimes(2);
    expect(mockTaskRepo.resetForRetry).toHaveBeenNthCalledWith(1, 'task-failed-1');
    expect(mockTaskRepo.resetForRetry).toHaveBeenNthCalledWith(2, 'task-failed-2');
  });
});
