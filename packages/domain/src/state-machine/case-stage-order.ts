import type { CaseStage } from '../enums/index.js';

export const STAGE_ORDER: CaseStage[] = [
  'PENDING_ASSIGNMENT',
  'TRANSFERRED_TO_HOSPITAL',
  'HOSPITAL_CONTACTED',
  'CONSULTATION_SCHEDULED',
  'IN_TREATMENT',
  'TREATMENT_COMPLETED',
];
