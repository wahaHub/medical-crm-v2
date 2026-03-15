import OpenAI from 'openai';
import type { ITranslationService, MessageType } from '@medical-crm/domain';

export class OpenAITranslationService implements ITranslationService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `Translate the following text to ${targetLang}. Return only the translation, no explanations.`,
        },
        { role: 'user', content: text },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async summarizeMessage(content: string, messageType: MessageType, lang: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `Summarize this ${messageType.toLowerCase()} message in ${lang}. Be concise (1-2 sentences).`,
        },
        { role: 'user', content },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }
}
