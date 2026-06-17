import type { ICaseRepository, IJourneyRepository, MilestoneEventType } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { JourneyMilestoneDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toJourneyMilestoneDTO } from '../../mappers/journey.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface UpdateMilestoneInput {
  eventType?: string;
  eventDate?: string;
  note?: string | null;
  isVisibleToPatient?: boolean;
}

export class UpdateMilestoneUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(milestoneId: string, input: UpdateMilestoneInput, actor: Actor): Promise<JourneyMilestoneDTO> {
    // Admin only
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update milestones');
    }

    const milestone = await this.journeyRepo.findMilestoneById(milestoneId);
    if (!milestone) throw new NotFoundError(`Milestone ${milestoneId} not found`);
    if (this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(milestone.caseId);
      if (!caseEntity) throw new NotFoundError(`Case ${milestone.caseId} not found`);
      await this.adminAccess.assertActorCanAccessCaseEntity(actor, caseEntity);
    }

    milestone.update({
      eventType: input.eventType as MilestoneEventType | undefined,
      eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
      note: input.note,
      isVisibleToPatient: input.isVisibleToPatient,
    });

    const saved = await this.journeyRepo.saveMilestone(milestone);
    return toJourneyMilestoneDTO(saved);
  }
}
