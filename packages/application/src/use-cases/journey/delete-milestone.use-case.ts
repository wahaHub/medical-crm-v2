import type { ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class DeleteMilestoneUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(milestoneId: string, actor: Actor): Promise<void> {
    // Admin only
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can delete milestones');
    }

    const milestone = await this.journeyRepo.findMilestoneById(milestoneId);
    if (!milestone) throw new NotFoundError(`Milestone ${milestoneId} not found`);
    if (this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(milestone.caseId);
      if (!caseEntity) throw new NotFoundError(`Case ${milestone.caseId} not found`);
      await this.adminAccess.assertStaffCaseNotExcludedByPatientEmail(actor, caseEntity);
      await this.adminAccess.assertActorCanAccessCaseEntity(actor, caseEntity);
    }

    await this.journeyRepo.deleteMilestone(milestoneId);
  }
}
