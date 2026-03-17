import type { IMessageRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export class ListPendingReviewUseCase {
  constructor(private readonly messageRepo: IMessageRepository) {}

  async execute(actor: Actor): Promise<MessageDTO[]> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can list pending review messages');
    }

    const messages = await this.messageRepo.findPendingReview();
    return messages.map((message) => toMessageDTO(message));
  }
}
