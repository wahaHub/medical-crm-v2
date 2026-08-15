import type { IQuoteRepository, ICaseRepository, QuoteListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import { getAdminPatientSiteScope, isStaffActor, type AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';

export class ListQuotesUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(query: QuoteListQuery, actor: Actor): Promise<{ data: QuoteDTO[]; total: number; page: number; limit: number }> {
    const effectiveQuery = { ...query };
    const patientSiteScope = getAdminPatientSiteScope(actor);
    if (patientSiteScope) {
      effectiveQuery.patientSiteScope = patientSiteScope;
    }
    if (isStaffActor(actor)) {
      Object.assign(effectiveQuery, withDefaultPatientEmailExclusions(effectiveQuery));
    }
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      effectiveQuery.hospitalId = actor.hospitalId;
    }

    // PATIENT must provide caseId and can only see quotes for own cases
    if (actor.role === 'PATIENT') {
      if (!effectiveQuery.caseId) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      const caseEntity = await this.caseRepo.findById(effectiveQuery.caseId);
      if (!caseEntity || caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Access denied to this case');
      }
    }
    if (actor.role === 'ADMIN' && effectiveQuery.caseId) {
      await this.adminAccess?.assertActorCanAccessCase(actor, effectiveQuery.caseId);
    }
    if (actor.role === 'HOSPITAL' && effectiveQuery.caseId) {
      await this.adminAccess?.assertActorCanAccessCase(actor, effectiveQuery.caseId);
    }

    if (effectiveQuery.hospitalId) {
      const result = await this.quoteRepo.findByHospitalId(effectiveQuery.hospitalId, effectiveQuery);
      return {
        data: result.data.map((e) => toQuoteDTO(e)),
        total: result.total,
        page: query.page,
        limit: query.limit,
      };
    }

    if (effectiveQuery.caseId) {
      const data = await this.quoteRepo.findByCaseId(effectiveQuery.caseId);
      return {
        data: data.map((e) => toQuoteDTO(e)),
        total: data.length,
        page: query.page,
        limit: query.limit,
      };
    }

    return { data: [], total: 0, page: query.page, limit: query.limit };
  }
}
