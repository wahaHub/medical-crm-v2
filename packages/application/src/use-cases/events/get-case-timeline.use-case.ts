import type { ICaseEventRepository, ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { TimelineItemDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { eventToTimelineItem } from '../../mappers/case-event.mapper.js';
import { milestoneToTimelineItem } from '../../mappers/journey.mapper.js';

export class GetCaseTimelineUseCase {
  constructor(
    private readonly eventRepo: ICaseEventRepository,
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<TimelineItemDTO[]> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL' && caseEntity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }
    if (actor.role === 'PATIENT' && caseEntity.patientId !== actor.userId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const isPatient = actor.role === 'PATIENT';

    // Fetch both events and milestones in parallel
    const [events, milestones] = await Promise.all([
      this.eventRepo.findVisibleByCaseId(caseId),
      this.journeyRepo.findMilestonesByCaseId(caseId, isPatient ? { visibleOnly: true } : undefined),
    ]);

    const items: TimelineItemDTO[] = [
      ...events.map(eventToTimelineItem),
      ...milestones.map(milestoneToTimelineItem),
    ];

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }
}
