import type { IConversationRepository, IMessageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { assertAdminCanAccessMessageConversationCase } from '../../access/admin-conversation-access.js';

export class RejectMessageUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly conversationRepo?: IConversationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(messageId: string, actor: Actor): Promise<MessageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can reject messages');
    }

    const message = await this.messageRepo.findById(messageId);
    if (!message) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }
    await assertAdminCanAccessMessageConversationCase(
      actor,
      message,
      this.conversationRepo,
      this.adminAccess,
    );

    message.reject();
    const saved = await this.messageRepo.save(message);
    return toMessageDTO(saved);
  }
}
