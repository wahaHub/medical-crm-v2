import type { ICaseRepository } from '@medical-crm/domain';
import type { CaseDTO } from '../../dtos/case.dto.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export interface GetPatientCasesInput {
  patientId: string;
}

export class GetPatientCasesUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: GetPatientCasesInput): Promise<CaseDTO[]> {
    const cases = await this.caseRepo.findByPatientId(input.patientId);
    return cases.map((c) => toCaseDTO(c));
  }
}
