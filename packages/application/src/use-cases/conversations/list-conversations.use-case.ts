import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';
import { getAdminPatientSiteScope, isStaffActor } from '../../access/admin-patient-site-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';

export class ListConversationsUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(query: ConversationListQuery, actor: Actor): Promise<PaginatedResult<ConversationDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    if ((actor.role === 'ADMIN' || actor.role === 'HOSPITAL') && query.caseId) {
      await this.adminAccess?.assertActorCanAccessCase(actor, query.caseId);
    }
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const siteScopedQuery = patientSiteScope ? { ...query, patientSiteScope } : query;
    const scopedQuery = isStaffActor(actor)
      ? withDefaultPatientEmailExclusions(siteScopedQuery)
      : siteScopedQuery;
    const result = await this.conversationRepo.findMany(scopedQuery, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toConversationDTO(c)),
    };
  }
}
