import type { ICaseEventRepository } from '@medical-crm/domain';
import type { TimelineItemDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { eventToTimelineItem } from '../../mappers/case-event.mapper.js';

export class GetCaseTimelineUseCase {
  constructor(private readonly eventRepo: ICaseEventRepository) {}

  async execute(caseId: string, _actor: Actor): Promise<TimelineItemDTO[]> {
    // For now, only events (Module 5 will add milestones)
    const events = await this.eventRepo.findVisibleByCaseId(caseId);
    const items = events.map(eventToTimelineItem);
    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }
}
