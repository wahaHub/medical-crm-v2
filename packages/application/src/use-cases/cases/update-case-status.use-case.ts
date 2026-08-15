import type { ICaseRepository, ICaseProgressRepository, CaseAssignmentStatus } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { assertAssignedHospitalCaseAccess } from './hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class UpdateCaseStatusUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, assignmentStatus: CaseAssignmentStatus, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL') {
      await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, entity);
      assertAssignedHospitalCaseAccess(entity, actor.hospitalId);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, entity);
    }

    const oldStatus = entity.assignmentStatus;
    entity.transitionAssignmentStatus(assignmentStatus);
    const saved = await this.caseRepo.save(entity);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId,
      title: `Assignment status changed from ${oldStatus} to ${assignmentStatus}`,
      description: null,
      progressType: 'STATUS_CHANGE',
      metadata: { from: oldStatus, to: assignmentStatus },
      recordedAt: new Date(),
      recordedById: actor.userId,
    }));

    return toCaseDTO(saved);
  }
}
