import type { MessageType } from '../enums/index.js';

export interface ITranslationService {
  translate(text: string, targetLang: string): Promise<string>;
  summarizeMessage(content: string, messageType: MessageType, lang: string): Promise<string>;
}
