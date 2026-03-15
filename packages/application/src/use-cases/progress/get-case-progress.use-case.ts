import type { ICaseProgressRepository } from '@medical-crm/domain';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';

export class GetCaseProgressUseCase {
  constructor(private readonly progressRepo: ICaseProgressRepository) {}

  async execute(caseId: string): Promise<CaseProgressDTO[]> {
    const progress = await this.progressRepo.findByCaseId(caseId);
    return progress.map(toProgressDTO);
  }
}
