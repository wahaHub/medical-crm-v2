export interface CaseEventDTO {
  id: string;
  caseId: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  eventData: unknown;
  isVisibleToPatient: boolean;
  createdAt: string;
}

export interface TimelineItemDTO {
  id: string;
  source: 'event' | 'milestone';
  type: string;
  timestamp: string;
  data: unknown;
}
