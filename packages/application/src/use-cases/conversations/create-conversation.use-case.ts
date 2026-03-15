import { Conversation, type IConversationRepository, type ConversationCategory } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';

export interface CreateConversationInput {
  category: ConversationCategory;
  caseId?: string;
  hospitalId?: string;
  title?: string;
}

export class CreateConversationUseCase {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async execute(input: CreateConversationInput, actor: Actor): Promise<ConversationDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create conversations');
    }

    const now = new Date();

    const entity = new Conversation({
      id: generateId(),
      category: input.category,
      caseId: input.caseId ?? null,
      hospitalId: input.hospitalId ?? null,
      title: input.title ?? null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.conversationRepo.save(entity);
    return toConversationDTO(saved);
  }
}
