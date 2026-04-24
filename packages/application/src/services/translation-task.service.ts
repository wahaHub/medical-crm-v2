import type { ITranslationTaskRepository, EnqueueTranslationInput } from '@medical-crm/domain';
import { TRANSLATION_CONFIG } from '@medical-crm/domain';

export class TranslationTaskService {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async enqueue(input: EnqueueTranslationInput): Promise<void> {
    // Filter out fields that carry no translation signal while preserving
    // explicit nulls so downstream writeback can clear stale localized values.
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.fieldsToTranslate)) {
      if (value !== undefined && value !== '') {
        filtered[key] = value;
      }
    }
    if (Object.keys(filtered).length === 0) return;

    const languages =
      input.targetLanguage !== undefined
        ? [input.targetLanguage]
        : (input.targetLanguages?.length ? input.targetLanguages : TRANSLATION_CONFIG.defaultTargetLanguages);

    for (const language of languages) {
      await this.taskRepo.upsert({
        ...input,
        fieldsToTranslate: filtered,
        targetLanguage: language,
        targetLanguages: [language],
      });
    }
  }
}
