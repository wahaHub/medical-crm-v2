import type { TranslationTaskStatus, SourceDb } from '../enums/translation.js';
import { TRANSLATION_CONFIG } from '../enums/translation.config.js';

export interface TranslationTaskProps {
  id: string;
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
  chunkKey?: string;
  hospitalType: string | null;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages: string[];
  sourceLanguage: string | null;
  targetLanguage: string | null; // legacy
  detectedLanguage: string | null;
  status: TranslationTaskStatus;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export class TranslationTask {
  readonly id: string;
  readonly sourceDb: SourceDb;
  readonly entityType: string;
  readonly entityId: string;
  readonly chunkKey: string;
  hospitalType: string | null;
  fieldsToTranslate: Record<string, unknown>;
  targetLanguages: string[];
  sourceLanguage: string | null;
  targetLanguage: string | null;
  detectedLanguage: string | null;
  status: TranslationTaskStatus;
  errorMessage: string | null;
  retryCount: number;
  readonly createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  private static readonly maxRetries = TRANSLATION_CONFIG.retry.maxRetries;

  constructor(props: TranslationTaskProps) {
    this.id = props.id;
    this.sourceDb = props.sourceDb;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.chunkKey = props.chunkKey ?? 'default';
    this.hospitalType = props.hospitalType;
    this.fieldsToTranslate = props.fieldsToTranslate;
    this.targetLanguages = props.targetLanguages;
    this.sourceLanguage = props.sourceLanguage;
    this.targetLanguage = props.targetLanguage;
    this.detectedLanguage = props.detectedLanguage;
    this.status = props.status;
    this.errorMessage = props.errorMessage;
    this.retryCount = props.retryCount;
    this.createdAt = props.createdAt;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
  }

  markProcessing(): void {
    this.status = 'processing';
    this.startedAt = new Date();
  }

  markCompleted(detectedLanguage: string): void {
    this.status = 'completed';
    this.detectedLanguage = detectedLanguage;
    this.completedAt = new Date();
    this.errorMessage = null;
  }

  markFailedOrRetry(error: string): void {
    this.retryCount += 1;
    this.errorMessage = error;
    if (this.retryCount >= TranslationTask.maxRetries) {
      this.status = 'failed';
    } else {
      this.status = 'pending';
    }
  }

  resetForRetry(): void {
    this.status = 'pending';
    this.retryCount = 0;
    this.errorMessage = null;
    this.startedAt = null;
    this.completedAt = null;
    this.detectedLanguage = null;
  }
}
