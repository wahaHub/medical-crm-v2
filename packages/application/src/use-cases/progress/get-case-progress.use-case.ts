import type { ICaseProgressRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import type { Actor } from '../../types/actor.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseProgressDTO[]> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caze);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caze);
    }
    const progress = await this.progressRepo.findByCaseId(caseId);
    return progress.map(toProgressDTO);
  }
}
