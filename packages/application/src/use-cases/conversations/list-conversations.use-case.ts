import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';

export class ListConversationsUseCase {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async execute(query: ConversationListQuery, actor: Actor): Promise<PaginatedResult<ConversationDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    const result = await this.conversationRepo.findMany(query, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toConversationDTO(c)),
    };
  }
}
