import type { CaseEvent } from '@medical-crm/domain';
import type { CaseEventDTO, TimelineItemDTO } from '../dtos/case-event.dto.js';

export function toCaseEventDTO(entity: CaseEvent): CaseEventDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    eventType: entity.eventType,
    actorType: entity.actorType,
    actorId: entity.actorId,
    eventData: entity.eventData,
    isVisibleToPatient: entity.isVisibleToPatient,
    createdAt: entity.createdAt.toISOString(),
  };
}

export function eventToTimelineItem(entity: CaseEvent): TimelineItemDTO {
  return {
    id: entity.id,
    source: 'event',
    type: entity.eventType,
    timestamp: entity.createdAt.toISOString(),
    data: entity.eventData,
  };
}
