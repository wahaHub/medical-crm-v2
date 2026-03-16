export interface CaseJourneyDTO {
  id: string;
  caseId: string;
  visa: unknown | null;
  insurance: unknown | null;
  accommodation: unknown | null;
  transportation: unknown | null;
  postCare: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyMilestoneDTO {
  id: string;
  caseId: string;
  eventType: string;
  eventDate: string;
  note: string | null;
  isVisibleToPatient: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
