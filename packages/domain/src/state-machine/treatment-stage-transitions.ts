import type { CaseTreatmentStage } from '../enums/index.js';

export const TREATMENT_STAGE_TRANSITIONS: Record<CaseTreatmentStage, CaseTreatmentStage[]> = {
  CONFIRMED: ['IN_TREATMENT'],
  IN_TREATMENT: ['POST_TREATMENT'],
  POST_TREATMENT: ['COMPLETED'],
  COMPLETED: ['FOLLOW_UP'],
  FOLLOW_UP: ['IN_TREATMENT'],
};
