import type { TicketStatus } from '../enums/index.js';

export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING_INFO', 'RESOLVED'],
  IN_PROGRESS: ['PENDING_INFO', 'RESOLVED'],
  PENDING_INFO: ['ASSIGNED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'ASSIGNED', 'IN_PROGRESS'],
  CLOSED: [],  // terminal
};
