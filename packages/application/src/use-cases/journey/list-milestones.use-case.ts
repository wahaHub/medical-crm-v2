import type { ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { JourneyMilestoneDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toJourneyMilestoneDTO } from '../../mappers/journey.mapper.js';

export class ListMilestonesUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(
    caseId: string,
    actor: Actor,
    options?: { visibleOnly?: boolean },
  ): Promise<JourneyMilestoneDTO[]> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);

    // AuthZ + determine visibility
    let visibleOnly = options?.visibleOnly ?? false;

    if (actor.role === 'HOSPITAL') {
      if (actor.hospitalId !== caseEntity.assignedHospitalId) {
        throw new ForbiddenError('Hospital can only access milestones for assigned cases');
      }
      // Hospital sees all milestones for their case
    } else if (actor.role === 'PATIENT') {
      if (actor.userId !== caseEntity.patientId) {
        throw new ForbiddenError('Patient can only access their own case milestones');
      }
      // Patient always sees only visible milestones
      visibleOnly = true;
    }
    // ADMIN always has access, sees all

    const milestones = await this.journeyRepo.findMilestonesByCaseId(caseId, {
      visibleOnly,
    });

    return milestones.map(toJourneyMilestoneDTO);
  }
}
