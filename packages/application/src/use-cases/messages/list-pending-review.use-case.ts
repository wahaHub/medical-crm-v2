import type { IConversationRepository, IMessageRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { isAdminMessageConversationCaseAllowed } from '../../access/admin-conversation-access.js';

export class ListPendingReviewUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly conversationRepo?: IConversationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(actor: Actor): Promise<MessageDTO[]> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can list pending review messages');
    }

    const messages = await this.messageRepo.findPendingReview();
    const visibleMessages = [];
    for (const message of messages) {
      if (await isAdminMessageConversationCaseAllowed(
        actor,
        message,
        this.conversationRepo,
        this.adminAccess,
      )) {
        visibleMessages.push(message);
      }
    }
    return visibleMessages.map((message) => toMessageDTO(message));
  }
}
