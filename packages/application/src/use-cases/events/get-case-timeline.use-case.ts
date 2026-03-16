import type { ICaseEventRepository, IJourneyRepository } from '@medical-crm/domain';
import type { TimelineItemDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { eventToTimelineItem } from '../../mappers/case-event.mapper.js';
import { milestoneToTimelineItem } from '../../mappers/journey.mapper.js';

export class GetCaseTimelineUseCase {
  constructor(
    private readonly eventRepo: ICaseEventRepository,
    private readonly journeyRepo: IJourneyRepository,
  ) {}

  async execute(caseId: string, _actor: Actor): Promise<TimelineItemDTO[]> {
    // Fetch both events and milestones in parallel
    const [events, milestones] = await Promise.all([
      this.eventRepo.findVisibleByCaseId(caseId),
      this.journeyRepo.findMilestonesByCaseId(caseId),
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
