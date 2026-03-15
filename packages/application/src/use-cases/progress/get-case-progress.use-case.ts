import type { ICaseProgressRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import type { Actor } from '../../types/actor.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';

export class GetCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseProgressDTO[]> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }
    const progress = await this.progressRepo.findByCaseId(caseId);
    return progress.map(toProgressDTO);
  }
}
