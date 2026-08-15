import type { SupportTicket } from '../entities/support-ticket.entity.js';
import type { PatientSiteAccessScope } from './patient-site-scope.port.js';

export interface TicketListQuery {
  patientId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
  priority?: string;
  caseId?: string;
  page: number;
  limit: number;
  patientSiteScope?: PatientSiteAccessScope;
  excludedPatientEmailDomains?: string[];
}

export interface ISupportTicketRepository {
  findById(id: string, tx?: unknown): Promise<SupportTicket | null>;
  findByPatientId(patientId: string, query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  findByAssignedTo(assignedTo: string, query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  findAll(query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  save(entity: SupportTicket, tx?: unknown): Promise<SupportTicket>;
  nextTicketNumber(): Promise<string>;
}
