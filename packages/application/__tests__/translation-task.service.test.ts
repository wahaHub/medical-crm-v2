import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationTaskService } from '../src/services/translation-task.service.js';
import type { ITranslationTaskRepository, EnqueueTranslationInput } from '@medical-crm/domain';
import { TranslationTask } from '@medical-crm/domain';

const makeTask = (): TranslationTask =>
  new TranslationTask({
    id: 'task-1',
    sourceDb: 'crm',
    entityType: 'case',
    entityId: 'entity-1',
    hospitalType: null,
    fieldsToTranslate: { name: 'John' },
    targetLanguages: ['zh'],
    sourceLanguage: null,
    targetLanguage: null,
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
  });

describe('TranslationTaskService', () => {
  let service: TranslationTaskService;
  let mockTaskRepo: ITranslationTaskRepository;

  beforeEach(() => {
    mockTaskRepo = {
      upsert: vi.fn().mockResolvedValue(makeTask()),
      pullPending: vi.fn().mockResolvedValue([]),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markFailedOrRetry: vi.fn().mockResolvedValue(undefined),
      resetForRetry: vi.fn().mockResolvedValue(undefined),
      findByEntity: vi.fn().mockResolvedValue([]),
    };
    service = new TranslationTaskService(mockTaskRepo);
  });

  describe('enqueue', () => {
    it('calls repo.upsert with valid fields', async () => {
      const input: EnqueueTranslationInput = {
        sourceDb: 'crm',
        entityType: 'case',
        entityId: 'entity-1',
        fieldsToTranslate: { name: 'John', description: 'Some text' },
        targetLanguage: 'zh',
        targetLanguages: ['zh', 'en'],
      };
      await service.enqueue(input);
      expect(mockTaskRepo.upsert).toHaveBeenCalledOnce();
      expect(mockTaskRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldsToTranslate: { name: 'John', description: 'Some text' },
          targetLanguage: 'zh',
          targetLanguages: ['zh'],
        }),
      );
    });

    it('fans out legacy multi-language enqueue into one row per target language when targetLanguage is absent', async () => {
      const input: EnqueueTranslationInput = {
        sourceDb: 'crm',
        entityType: 'case',
        entityId: 'entity-1',
        fieldsToTranslate: { name: 'John', description: 'Some text' },
        targetLanguages: ['zh', 'en'],
      };

      await service.enqueue(input);

      expect(mockTaskRepo.upsert).toHaveBeenCalledTimes(2);
      expect(mockTaskRepo.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          targetLanguage: 'zh',
          targetLanguages: ['zh'],
        }),
      );
      expect(mockTaskRepo.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          targetLanguage: 'en',
          targetLanguages: ['en'],
        }),
      );
    });

    it('filters out null, undefined, and empty string fields', async () => {
      const input: EnqueueTranslationInput = {
        sourceDb: 'crm',
        entityType: 'case',
        entityId: 'entity-1',
        fieldsToTranslate: {
          name: 'John',
          emptyStr: '',
          nullVal: null,
          undefinedVal: undefined,
          valid: 'keep me',
        },
        targetLanguages: ['zh'],
      };
      await service.enqueue(input);
      expect(mockTaskRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldsToTranslate: { name: 'John', valid: 'keep me' },
        }),
      );
    });

    it('skips upsert when all fields are empty', async () => {
      const input: EnqueueTranslationInput = {
        sourceDb: 'crm',
        entityType: 'case',
        entityId: 'entity-1',
        fieldsToTranslate: {
          emptyStr: '',
          nullVal: null,
          undefinedVal: undefined,
        },
        targetLanguages: ['zh'],
      };
      await service.enqueue(input);
      expect(mockTaskRepo.upsert).not.toHaveBeenCalled();
    });

    it('skips upsert when fieldsToTranslate is empty object', async () => {
      const input: EnqueueTranslationInput = {
        sourceDb: 'crm',
        entityType: 'case',
        entityId: 'entity-1',
        fieldsToTranslate: {},
        targetLanguages: ['zh'],
      };
      await service.enqueue(input);
      expect(mockTaskRepo.upsert).not.toHaveBeenCalled();
    });
  });
});
