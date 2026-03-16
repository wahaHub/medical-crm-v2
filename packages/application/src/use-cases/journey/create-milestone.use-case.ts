import type { ICaseRepository, IJourneyRepository, MilestoneEventType } from '@medical-crm/domain';
import { JourneyMilestone } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { JourneyMilestoneDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toJourneyMilestoneDTO } from '../../mappers/journey.mapper.js';

export interface CreateMilestoneInput {
  eventType: string;
  eventDate: string;
  note?: string;
  isVisibleToPatient?: boolean;
}

export class CreateMilestoneUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, input: CreateMilestoneInput, actor: Actor): Promise<JourneyMilestoneDTO> {
    // Admin or Hospital (assigned only)
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot create milestones');
    }

    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);

    if (actor.role === 'HOSPITAL') {
      if (actor.hospitalId !== caseEntity.assignedHospitalId) {
        throw new ForbiddenError('Hospital can only create milestones for assigned cases');
      }
    }

    const milestone = new JourneyMilestone({
      id: crypto.randomUUID(),
      caseId,
      eventType: input.eventType as MilestoneEventType,
      eventDate: new Date(input.eventDate),
      note: input.note ?? null,
      isVisibleToPatient: input.isVisibleToPatient ?? true,
      createdBy: actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.journeyRepo.saveMilestone(milestone);
    return toJourneyMilestoneDTO(saved);
  }
}
