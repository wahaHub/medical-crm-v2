import type { ICaseProgressRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import type { Actor } from '../../types/actor.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

export class GetCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseProgressDTO[]> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    }
    const progress = await this.progressRepo.findByCaseId(caseId);
    return progress.map(toProgressDTO);
  }
}
