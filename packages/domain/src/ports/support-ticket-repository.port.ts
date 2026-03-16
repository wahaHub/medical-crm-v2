import type { SupportTicket } from '../entities/support-ticket.entity.js';

export interface TicketListQuery {
  patientId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
  priority?: string;
  page: number;
  limit: number;
}

export interface ISupportTicketRepository {
  findById(id: string, tx?: unknown): Promise<SupportTicket | null>;
  findByPatientId(patientId: string, query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  findByAssignedTo(assignedTo: string, query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  findAll(query: TicketListQuery): Promise<{ data: SupportTicket[]; total: number }>;
  save(entity: SupportTicket, tx?: unknown): Promise<SupportTicket>;
  nextTicketNumber(): Promise<string>;
}
