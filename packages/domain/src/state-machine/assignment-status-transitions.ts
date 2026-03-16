import type { CaseAssignmentStatus } from '../enums/index.js';

export const ASSIGNMENT_STATUS_TRANSITIONS: Record<CaseAssignmentStatus, CaseAssignmentStatus[]> = {
  UNASSIGNED: ['ASSIGNED'],
  ASSIGNED: ['UNASSIGNED'],
};
