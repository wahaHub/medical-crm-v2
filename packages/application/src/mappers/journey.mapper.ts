import type { CaseJourney, JourneyMilestone } from '@medical-crm/domain';
import type { CaseJourneyDTO, JourneyMilestoneDTO } from '../dtos/journey.dto.js';
import type { TimelineItemDTO } from '../dtos/case-event.dto.js';

export function toCaseJourneyDTO(entity: CaseJourney): CaseJourneyDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    visa: entity.visa,
    insurance: entity.insurance,
    accommodation: entity.accommodation,
    transportation: entity.transportation,
    postCare: entity.postCare,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toJourneyMilestoneDTO(entity: JourneyMilestone): JourneyMilestoneDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    eventType: entity.eventType,
    eventDate: entity.eventDate.toISOString(),
    note: entity.note,
    isVisibleToPatient: entity.isVisibleToPatient,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function milestoneToTimelineItem(entity: JourneyMilestone): TimelineItemDTO {
  return {
    id: entity.id,
    source: 'milestone',
    type: entity.eventType,
    timestamp: entity.eventDate.toISOString(),
    data: {
      note: entity.note,
      isVisibleToPatient: entity.isVisibleToPatient,
      createdBy: entity.createdBy,
    },
  };
}
