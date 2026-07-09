import type { IConversationRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { assertStaffCanAccessConversationCase } from '../../access/admin-conversation-access.js';

export interface UpdateConversationInput {
  title?: string;
  assistantMode?: 'AI_ACTIVE';
}

export class UpdateConversationUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

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
    await assertStaffCanAccessConversationCase(actor, entity, this.adminAccess);

    if (input.title !== undefined) entity.title = input.title;
    entity.updatedAt = new Date();

    const saved = await this.conversationRepo.save(entity);
    return toConversationDTO(saved);
  }
}
