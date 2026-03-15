import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class GetCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(caseId: string, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }
    return toCaseDTO(entity);
  }
}
