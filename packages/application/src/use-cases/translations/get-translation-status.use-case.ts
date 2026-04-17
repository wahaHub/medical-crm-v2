import type { ITranslationTaskRepository, SourceDb, TranslationTaskStatus } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import { aggregateTranslationTasks } from './translation-task-aggregation.js';

export interface TranslationStatusResult {
  status: TranslationTaskStatus;
  retryCount: number;
  errorMessage: string | null;
  detectedLanguage: string | null;
}

export class GetTranslationStatusUseCase {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async execute(
    sourceDb: SourceDb,
    entityType: string,
    entityId: string,
    actor: Actor,
  ): Promise<TranslationStatusResult | null> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    const tasks = await this.taskRepo.findByEntity(sourceDb, entityType, entityId);
    if (!tasks || tasks.length === 0) return null;
    return aggregateTranslationTasks(tasks);
  }
}
