import type { AiChatMessage } from '../entities/ai-chat-message.entity.js';

export interface IAiChatMessageRepository {
  create(entity: AiChatMessage, tx?: unknown): Promise<AiChatMessage>;
  listBySession(sessionId: string, limit?: number, tx?: unknown): Promise<AiChatMessage[]>;
}
