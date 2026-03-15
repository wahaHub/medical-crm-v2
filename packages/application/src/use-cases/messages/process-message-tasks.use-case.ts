import type { IMessageRepository, IMessageTaskQueue, ITranslationService } from '@medical-crm/domain';

export interface ProcessMessageTasksResult {
  processed: number;
  failed: number;
}

export class ProcessMessageTasksUseCase {
  constructor(
    private readonly taskQueue: IMessageTaskQueue,
    private readonly messageRepo: IMessageRepository,
    private readonly translationService: ITranslationService,
  ) {}

  async execute(): Promise<ProcessMessageTasksResult> {
    const tasks = await this.taskQueue.pullPending(10);
    let processed = 0;
    let failed = 0;

    for (const task of tasks) {
      if (task.retryCount >= 3) {
        await this.taskQueue.markFailed(task.id, 'Max retries exceeded');
        failed++;
        continue;
      }

      await this.taskQueue.markProcessing(task.id);

      try {
        const message = await this.messageRepo.findById(task.messageId);
        if (!message) {
          await this.taskQueue.markFailed(task.id, 'Message not found');
          failed++;
          continue;
        }

        if (task.taskKind === 'SUMMARIZE') {
          const summary = await this.translationService.summarizeMessage(
            message.content,
            message.messageType,
            message.originalLanguage ?? 'en',
          );
          message.setAiSummary(summary);
        } else if (task.taskKind === 'TRANSLATE' && task.targetLanguage) {
          const translated = await this.translationService.translate(
            message.content,
            task.targetLanguage,
          );
          message.setTranslation(translated);
        }

        await this.messageRepo.save(message);
        await this.taskQueue.markCompleted(task.id);
        processed++;
      } catch (err) {
        await this.taskQueue.markFailed(
          task.id,
          err instanceof Error ? err.message : 'Unknown error',
        );
        failed++;
      }
    }

    return { processed, failed };
  }
}
