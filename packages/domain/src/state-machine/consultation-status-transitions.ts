import type { ConsultationStatus } from '../enums/index.js';

export const CONSULTATION_STATUS_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
