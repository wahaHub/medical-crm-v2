import type { MessageTaskKind } from '../enums/index.js';

export interface MessageTask {
  id: string;
  messageId: string;
  taskKind: MessageTaskKind;
  targetLanguage: string | null;
  retryCount: number;
}

export interface IMessageTaskQueue {
  enqueueTranslation(messageId: string, targetLang: string): Promise<void>;
  enqueueSummarization(messageId: string): Promise<void>;
  pullPending(limit: number): Promise<MessageTask[]>;
  markProcessing(taskId: string): Promise<void>;
  markCompleted(taskId: string): Promise<void>;
  markFailed(taskId: string, error: string): Promise<void>;
}
