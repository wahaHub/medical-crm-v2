import type { TicketStatus } from '../enums/index.js';

export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED'],
  ASSIGNED: ['PENDING_INFO', 'RESOLVED'],
  PENDING_INFO: ['ASSIGNED'],
  RESOLVED: ['CLOSED', 'ASSIGNED'],
  CLOSED: [],  // terminal
};
