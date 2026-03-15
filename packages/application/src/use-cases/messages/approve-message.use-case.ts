import type { IMessageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export class ApproveMessageUseCase {
  constructor(private readonly messageRepo: IMessageRepository) {}

  async execute(messageId: string, actor: Actor): Promise<MessageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can approve messages');
    }

    const message = await this.messageRepo.findById(messageId);
    if (!message) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }

    message.approve();
    const saved = await this.messageRepo.save(message);
    return toMessageDTO(saved);
  }
}
