import type { ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';

export class ListCasesUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(query: CaseListQuery, actor: Actor): Promise<PaginatedResult<CaseDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const scopedQuery = patientSiteScope ? { ...query, patientSiteScope } : query;
    const result = await this.caseRepo.findMany(scopedQuery, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toCaseDTO(c)),
    };
  }
}
