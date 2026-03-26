import { describe, it, expect } from 'vitest';
import { TranslationTask } from '../src/entities/translation-task.entity.js';
import { TRANSLATION_CONFIG } from '../src/enums/translation.config.js';
import type { TranslationTaskProps } from '../src/entities/translation-task.entity.js';

function makeProps(overrides: Partial<TranslationTaskProps> = {}): TranslationTaskProps {
  return {
    id: 'task-1',
    sourceDb: 'crm',
    entityType: 'hospital',
    entityId: 'hosp-1',
    hospitalType: null,
    fieldsToTranslate: { name: 'Test Hospital', description: 'A great hospital' },
    targetLanguages: ['en', 'ru', 'fr'],
    sourceLanguage: null,
    targetLanguage: null,
    detectedLanguage: null,
    status: 'pending',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-01-01'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('TranslationTask entity', () => {
  describe('constructor', () => {
    it('creates a task with all props', () => {
      const task = new TranslationTask(makeProps());
      expect(task.id).toBe('task-1');
      expect(task.sourceDb).toBe('crm');
      expect(task.entityType).toBe('hospital');
      expect(task.entityId).toBe('hosp-1');
      expect(task.status).toBe('pending');
      expect(task.retryCount).toBe(0);
      expect(task.detectedLanguage).toBeNull();
      expect(task.startedAt).toBeNull();
      expect(task.completedAt).toBeNull();
    });

    it('creates a task with hospitalType and sourceLanguage', () => {
      const task = new TranslationTask(makeProps({
        hospitalType: 'COSMETIC',
        sourceLanguage: 'zh',
        targetLanguage: 'en',
      }));
      expect(task.hospitalType).toBe('COSMETIC');
      expect(task.sourceLanguage).toBe('zh');
      expect(task.targetLanguage).toBe('en');
    });
  });

  describe('markProcessing', () => {
    it('sets status to processing and sets startedAt', () => {
      const task = new TranslationTask(makeProps());
      task.markProcessing();
      expect(task.status).toBe('processing');
      expect(task.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('markCompleted', () => {
    it('sets status to completed, detectedLanguage, and completedAt', () => {
      const task = new TranslationTask(makeProps({ status: 'processing' }));
      task.markCompleted('zh');
      expect(task.status).toBe('completed');
      expect(task.detectedLanguage).toBe('zh');
      expect(task.completedAt).toBeInstanceOf(Date);
      expect(task.errorMessage).toBeNull();
    });

    it('clears errorMessage on completion', () => {
      const task = new TranslationTask(makeProps({
        status: 'processing',
        errorMessage: 'previous error',
      }));
      task.markCompleted('en');
      expect(task.errorMessage).toBeNull();
    });
  });

  describe('markFailedOrRetry', () => {
    it('increments retryCount and sets status to pending when below maxRetries', () => {
      const task = new TranslationTask(makeProps({ retryCount: 0 }));
      task.markFailedOrRetry('timeout error');
      expect(task.retryCount).toBe(1);
      expect(task.status).toBe('pending');
      expect(task.errorMessage).toBe('timeout error');
    });

    it('sets status to failed when retryCount reaches maxRetries', () => {
      const maxRetries = TRANSLATION_CONFIG.retry.maxRetries;
      const task = new TranslationTask(makeProps({ retryCount: maxRetries - 1 }));
      task.markFailedOrRetry('final error');
      expect(task.retryCount).toBe(maxRetries);
      expect(task.status).toBe('failed');
      expect(task.errorMessage).toBe('final error');
    });

    it('sets status to pending when retryCount is 1 below maxRetries', () => {
      const maxRetries = TRANSLATION_CONFIG.retry.maxRetries;
      const task = new TranslationTask(makeProps({ retryCount: maxRetries - 2 }));
      task.markFailedOrRetry('transient error');
      expect(task.retryCount).toBe(maxRetries - 1);
      expect(task.status).toBe('pending');
    });
  });

  describe('resetForRetry', () => {
    it('resets all fields to initial state', () => {
      const task = new TranslationTask(makeProps({
        status: 'failed',
        retryCount: 3,
        errorMessage: 'some error',
        startedAt: new Date('2026-01-02'),
        completedAt: new Date('2026-01-03'),
        detectedLanguage: 'zh',
      }));
      task.resetForRetry();
      expect(task.status).toBe('pending');
      expect(task.retryCount).toBe(0);
      expect(task.errorMessage).toBeNull();
      expect(task.startedAt).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.detectedLanguage).toBeNull();
    });
  });

  describe('TRANSLATION_CONFIG integration', () => {
    it('has maxRetries = 3', () => {
      expect(TRANSLATION_CONFIG.retry.maxRetries).toBe(3);
    });

    it('has 9 supported languages', () => {
      expect(TRANSLATION_CONFIG.supportedLanguages).toHaveLength(9);
      expect(TRANSLATION_CONFIG.supportedLanguages).toContain('zh');
      expect(TRANSLATION_CONFIG.supportedLanguages).toContain('en');
      expect(TRANSLATION_CONFIG.supportedLanguages).toContain('ar');
    });

    it('has defaultTargetLanguages matching supportedLanguages', () => {
      expect(TRANSLATION_CONFIG.defaultTargetLanguages).toEqual(TRANSLATION_CONFIG.supportedLanguages);
    });

    it('has translatableFields for known entity types', () => {
      expect(TRANSLATION_CONFIG.translatableFields.hospital).toBeDefined();
      expect(TRANSLATION_CONFIG.translatableFields.message).toBeDefined();
      expect(TRANSLATION_CONFIG.translatableFields.case).toBeDefined();
    });
  });
});
