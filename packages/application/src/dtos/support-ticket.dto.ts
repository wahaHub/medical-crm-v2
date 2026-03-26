export interface SupportTicketDTO {
  id: string;
  ticketNumber: string;
  patientId: string;
  caseId: string | null;
  type: string;
  priority: string;
  status: string;
  subject: string | null;
  description: string;
  sourcePage: string | null;
  assignedTo: string | null;
  slaDeadline: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  translations: Record<string, Record<string, unknown>>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketReplyDTO {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: string;
  content: string;
  isInternalNote: boolean;
  attachments: unknown;
  translations: Record<string, Record<string, unknown>>;
  createdAt: string;
}
