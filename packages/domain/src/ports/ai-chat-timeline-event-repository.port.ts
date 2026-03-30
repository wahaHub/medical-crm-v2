import type { AiChatTimelineEvent } from '../entities/ai-chat-timeline-event.entity.js';

export interface IAiChatTimelineEventRepository {
  listRecentBySession(sessionId: string, limit?: number, tx?: unknown): Promise<AiChatTimelineEvent[]>;
  append(entity: AiChatTimelineEvent, tx?: unknown): Promise<AiChatTimelineEvent>;
}
