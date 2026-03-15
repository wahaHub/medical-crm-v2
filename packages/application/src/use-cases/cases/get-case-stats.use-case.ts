import type { ICaseRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseStatsDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';

export class GetCaseStatsUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(actor: Actor): Promise<CaseStatsDTO> {
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      return this.caseRepo.countByFilters({ hospitalId: actor.hospitalId });
    }
    return this.caseRepo.countByFilters({});
  }
}
