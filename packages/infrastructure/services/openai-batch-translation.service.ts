import OpenAI from 'openai';
import type { IBatchTranslationService, BatchTranslateRequest, BatchTranslateResult } from '@medical-crm/domain';

export class OpenAIBatchTranslationService implements IBatchTranslationService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async translateBatch(request: BatchTranslateRequest): Promise<BatchTranslateResult> {
    const { fields, targetLanguages } = request;

    const systemPrompt = [
      'You are a professional medical translator.',
      'Auto-detect the source language of the provided fields.',
      `Translate all non-empty fields into the following target languages: ${targetLanguages.join(', ')}.`,
      'Return a JSON object with exactly two keys:',
      '  "detected_language": the ISO 639-1 code of the detected source language (e.g. "zh", "en", "ko"),',
      '  "translations": an object keyed by language code, each value being the translated fields object.',
      'Preserve the original field structure. Skip (omit) fields that are empty or null.',
      'Do not translate or remove non-language fields such as image_url, videoUrl, id, idx, slug, storage keys, URLs, numeric values, or department_code.',
      'Do NOT include the source language in the translations object.',
      'Use formal medical terminology throughout.',
    ].join('\n');

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(fields) },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('OpenAI returned an empty response for batch translation');
    }

    const parsed = JSON.parse(raw) as {
      detected_language?: string;
      translations?: Record<string, Record<string, unknown>>;
    };

    if (!parsed.detected_language || !parsed.translations) {
      throw new Error('OpenAI response is missing required fields: detected_language or translations');
    }

    const detectedLanguage = parsed.detected_language;
    const translations = { ...parsed.translations };

    // Remove source language from translations if OpenAI included it
    delete translations[detectedLanguage];

    return { detectedLanguage, translations };
  }
}
