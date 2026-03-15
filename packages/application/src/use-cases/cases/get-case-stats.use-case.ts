import type { ICaseRepository } from '@medical-crm/domain';
import type { CaseStatsDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';

export class GetCaseStatsUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(actor: Actor): Promise<CaseStatsDTO> {
    const filters = actor.role === 'HOSPITAL'
      ? { hospitalId: actor.hospitalId! }
      : {};
    return this.caseRepo.countByFilters(filters);
  }
}
