import type { TranslationTask, TranslationTaskStatus } from '@medical-crm/domain';

export interface TranslationTaskAggregate {
  status: TranslationTaskStatus;
  retryCount: number;
  errorMessage: string | null;
  detectedLanguage: string | null;
}

export function aggregateTranslationTasks(tasks: TranslationTask[]): TranslationTaskAggregate {
  const hasProcessing = tasks.some((task) => task.status === 'processing');
  const hasPending = !hasProcessing && tasks.some((task) => task.status === 'pending');
  const hasFailed = !hasProcessing && !hasPending && tasks.some((task) => task.status === 'failed');

  const status: TranslationTaskStatus = hasProcessing
    ? 'processing'
    : hasPending
      ? 'pending'
      : hasFailed
        ? 'failed'
        : 'completed';

  const retryCount = tasks.reduce((max, task) => Math.max(max, task.retryCount), 0);

  const failedTask = tasks.find((task) => task.status === 'failed');
  const errorMessage = status === 'failed' ? (failedTask?.errorMessage ?? null) : null;

  const detectedLanguageValues = tasks.map((task) => task.detectedLanguage);
  const detectedLanguage =
    detectedLanguageValues.length > 0 &&
    detectedLanguageValues.every((value) => value !== null) &&
    new Set(detectedLanguageValues).size === 1
      ? detectedLanguageValues[0] ?? null
      : null;

  return {
    status,
    retryCount,
    errorMessage,
    detectedLanguage,
  };
}

export function getFailedTaskIds(tasks: TranslationTask[]): string[] {
  return tasks.filter((task) => task.status === 'failed').map((task) => task.id);
}
