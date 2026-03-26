import type { TicketType, TicketPriority, TicketStatus } from '../enums/index.js';
import type { TicketNumber } from '../value-objects/ticket-number.js';
import { ValidationError } from '@medical-crm/utils';
import { TICKET_STATUS_TRANSITIONS } from '../state-machine/ticket-status-transitions.js';

export interface SupportTicketProps {
  id: string;
  ticketNumber: TicketNumber;
  patientId: string;
  caseId: string | null;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string | null;
  description: string;
  sourcePage: string | null;
  assignedTo: string | null;
  slaDeadline: Date | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  translations?: Record<string, Record<string, unknown>>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class SupportTicket {
  readonly id: string;
  readonly ticketNumber: TicketNumber;
  readonly patientId: string;
  caseId: string | null;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string | null;
  description: string;
  sourcePage: string | null;
  assignedTo: string | null;
  slaDeadline: Date | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  translations: Record<string, Record<string, unknown>>;
  version: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: SupportTicketProps) {
    this.id = props.id;
    this.ticketNumber = props.ticketNumber;
    this.patientId = props.patientId;
    this.caseId = props.caseId;
    this.type = props.type;
    this.priority = props.priority;
    this.status = props.status;
    this.subject = props.subject;
    this.description = props.description;
    this.sourcePage = props.sourcePage;
    this.assignedTo = props.assignedTo;
    this.slaDeadline = props.slaDeadline;
    this.resolutionNote = props.resolutionNote;
    this.resolvedAt = props.resolvedAt;
    this.translations = props.translations ?? {};
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transitionStatus(to: TicketStatus): void {
    const allowed = TICKET_STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition ticket status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  assign(userId: string): void {
    this.transitionStatus('ASSIGNED');
    this.assignedTo = userId;
  }

  resolve(note: string): void {
    this.transitionStatus('RESOLVED');
    this.resolutionNote = note;
    this.resolvedAt = new Date();
  }

  close(): void {
    this.transitionStatus('CLOSED');
  }
}
