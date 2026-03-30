import type { AiChatMessage } from '../entities/ai-chat-message.entity.js';
import type { AiChatCitation } from '../entities/ai-chat-message.entity.js';
import type { AiChatIntent, AiChatNextAction, AiChatRiskLevel } from '../enums/index.js';

export interface IAiChatMessageRepository {
  create(entity: AiChatMessage, tx?: unknown): Promise<AiChatMessage>;
  listBySession(sessionId: string, limit?: number, tx?: unknown): Promise<AiChatMessage[]>;
  listRecentBySession(sessionId: string, limit?: number, tx?: unknown): Promise<AiChatMessage[]>;
  updateMessage(
    messageId: string,
    patch: {
      content?: string;
      intent?: AiChatIntent | null;
      resolvedIntent?: string | null;
      riskLevel?: AiChatRiskLevel | null;
      canAnswer?: boolean | null;
      nextAction?: AiChatNextAction | null;
      secondaryAction?: string | null;
      responseMode?: string | null;
      citations?: AiChatCitation[];
      metadata?: Record<string, unknown>;
      reasonCodes?: string[];
      shortlist?: Array<Record<string, unknown>>;
      writebackStatus?: string;
      toolTrace?: Array<Record<string, unknown>>;
    },
    tx?: unknown,
  ): Promise<AiChatMessage | null>;
  updateWritebackMetadata(
    messageId: string,
    patch: {
      metadata?: Record<string, unknown>;
      writebackStatus?: string;
    },
    tx?: unknown,
  ): Promise<AiChatMessage | null>;
  deleteById(messageId: string, tx?: unknown): Promise<boolean>;
}
