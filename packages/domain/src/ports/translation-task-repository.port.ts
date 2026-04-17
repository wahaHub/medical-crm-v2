import type { SourceDb } from '../enums/translation.js';
import type { TranslationTask } from '../entities/translation-task.entity.js';

export interface EnqueueTranslationInput {
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
  hospitalType?: string;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages?: string[];
  targetLanguage?: string;
  chunkKey?: string;
}

export interface ITranslationTaskRepository {
  upsert(input: EnqueueTranslationInput): Promise<TranslationTask>;
  pullPending(limit: number): Promise<TranslationTask[]>;
  markProcessing(taskId: string): Promise<void>;
  markCompleted(taskId: string, detectedLanguage: string): Promise<void>;
  markFailedOrRetry(taskId: string, error: string): Promise<void>;
  resetForRetry(taskId: string): Promise<void>;
  findByEntity(sourceDb: SourceDb, entityType: string, entityId: string): Promise<TranslationTask[]>;
}
