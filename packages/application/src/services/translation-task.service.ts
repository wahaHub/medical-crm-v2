import type { ITranslationTaskRepository, EnqueueTranslationInput } from '@medical-crm/domain';
import { TRANSLATION_CONFIG } from '@medical-crm/domain';

export class TranslationTaskService {
  constructor(private readonly taskRepo: ITranslationTaskRepository) {}

  async enqueue(input: EnqueueTranslationInput): Promise<void> {
    // Filter out empty/null/undefined fields
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.fieldsToTranslate)) {
      if (value !== null && value !== undefined && value !== '') {
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
