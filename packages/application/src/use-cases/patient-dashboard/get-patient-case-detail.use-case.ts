import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export interface GetPatientCaseDetailInput {
  caseId: string;
  patientId: string;
}

export class GetPatientCaseDetailUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: GetPatientCaseDetailInput): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(input.caseId);
    if (!entity) {
      throw new NotFoundError(`Case ${input.caseId} not found`);
    }
    if (entity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this case');
    }
    return toCaseDTO(entity);
  }
}
