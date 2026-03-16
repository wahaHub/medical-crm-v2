import type { ICHCRepository, CHCListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';

export class ListCaseHospitalContactsUseCase {
  constructor(private readonly chcRepo: ICHCRepository) {}

  async execute(
    query: CHCListQuery,
    actor: Actor,
  ): Promise<{ data: CaseHospitalContactDTO[]; total: number; page: number; limit: number }> {
    const effectiveQuery = { ...query };

    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      effectiveQuery.hospitalId = actor.hospitalId;
    }

    // Use findByCaseId for case-scoped queries
    if (effectiveQuery.caseId) {
      const data = await this.chcRepo.findByCaseId(effectiveQuery.caseId);
      return {
        data: data.map((e) => toCaseHospitalContactDTO(e)),
        total: data.length,
        page: query.page,
        limit: query.limit,
      };
    }

    // Use findByHospitalId for hospital-scoped queries
    if (effectiveQuery.hospitalId) {
      const result = await this.chcRepo.findByHospitalId(effectiveQuery.hospitalId, effectiveQuery);
      return {
        data: result.data.map((e) => toCaseHospitalContactDTO(e)),
        total: result.total,
        page: query.page,
        limit: query.limit,
      };
    }

    // No filter — return empty for now (would need a findAll method)
    return { data: [], total: 0, page: query.page, limit: query.limit };
  }
}
