import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';

export class ListConversationsUseCase {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async execute(query: ConversationListQuery, actor: Actor): Promise<PaginatedResult<ConversationDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const scopedQuery = patientSiteScope ? { ...query, patientSiteScope } : query;
    const result = await this.conversationRepo.findMany(scopedQuery, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toConversationDTO(c)),
    };
  }
}
