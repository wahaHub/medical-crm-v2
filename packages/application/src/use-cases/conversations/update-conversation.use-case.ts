import type { IConversationRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';

export interface UpdateConversationInput {
  title?: string;
}

export class UpdateConversationUseCase {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async execute(id: string, input: UpdateConversationInput, actor: Actor): Promise<ConversationDTO> {
    const entity = await this.conversationRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Conversation ${id} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      if (entity.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this conversation');
      }
      if (entity.category === 'ADMIN_PATIENT') {
        throw new ForbiddenError('Access denied to this conversation');
      }
    }

    if (input.title !== undefined) entity.title = input.title;
    entity.updatedAt = new Date();

    const saved = await this.conversationRepo.save(entity);
    return toConversationDTO(saved);
  }
}
