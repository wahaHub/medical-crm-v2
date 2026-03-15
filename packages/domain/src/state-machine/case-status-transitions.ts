import type { CaseStatus } from '../enums/index.js';

export const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};
