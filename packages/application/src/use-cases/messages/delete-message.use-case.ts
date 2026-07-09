import type { IConversationRepository, IMessageRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { assertStaffCanAccessConversationCase } from '../../access/admin-conversation-access.js';

export class DeleteMessageUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    conversationId: string,
    messageId: string,
    actor: Actor,
  ): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      if (conversation.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this conversation');
      }
      if (conversation.category === 'ADMIN_PATIENT') {
        throw new ForbiddenError('Access denied to this conversation');
      }
    }
    await assertStaffCanAccessConversationCase(actor, conversation, this.adminAccess);

    const message = await this.messageRepo.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }

    await this.messageRepo.delete(messageId);
  }
}
