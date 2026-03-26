import type { ITranslationTaskRepository, SourceDb } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface RetryTranslationInput {
  sourceDb: SourceDb;
  entityType: string;
  entityId: string;
}

export class RetryTranslationUseCase {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async execute(input: RetryTranslationInput, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    const tasks = await this.taskRepo.findByEntity(input.sourceDb, input.entityType, input.entityId);
    if (!tasks || tasks.length === 0) {
      throw new NotFoundError('Translation task not found');
    }
    // Reset the most recent task for retry
    await this.taskRepo.resetForRetry(tasks[0]!.id);
  }
}
