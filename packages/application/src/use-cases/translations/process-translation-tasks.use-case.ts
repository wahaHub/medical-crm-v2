import type {
  ITranslationTaskRepository,
  IBatchTranslationService,
  BatchTranslateResult,
} from '@medical-crm/domain';
import type { TranslationTask } from '@medical-crm/domain';

export interface TranslationWriteback {
  writeback(task: TranslationTask, result: BatchTranslateResult): Promise<void>;
}

export interface ProcessTranslationTasksResult {
  processed: number;
  failed: number;
}

export class ProcessTranslationTasksUseCase {
  constructor(
    private readonly taskRepo: ITranslationTaskRepository,
    private readonly translationService: IBatchTranslationService,
    private readonly writebackService: TranslationWriteback,
  ) {}

  async execute(batchSize = 5): Promise<ProcessTranslationTasksResult> {
    const tasks = await this.taskRepo.pullPending(batchSize);
    let processed = 0;
    let failed = 0;

    for (const task of tasks) {
      try {
        const result = await this.translationService.translateBatch({
          fields: task.fieldsToTranslate,
          targetLanguages: task.targetLanguages,
        });
        await this.writebackService.writeback(task, result);
        await this.taskRepo.markCompleted(task.id, result.detectedLanguage);
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await this.taskRepo.markFailedOrRetry(task.id, errorMsg);
        failed++;
      }
    }

    return { processed, failed };
  }
}
