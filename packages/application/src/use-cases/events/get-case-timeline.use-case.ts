import type { ICaseEventRepository, ICaseRepository, IJourneyRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { TimelineItemDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { eventToTimelineItem } from '../../mappers/case-event.mapper.js';
import { milestoneToTimelineItem } from '../../mappers/journey.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetCaseTimelineUseCase {
  constructor(
    private readonly eventRepo: ICaseEventRepository,
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<TimelineItemDTO[]> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo);
    } else if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caseEntity);
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
