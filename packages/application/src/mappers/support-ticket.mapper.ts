import type { SupportTicket, SupportTicketReply } from '@medical-crm/domain';
import type { SupportTicketDTO, SupportTicketReplyDTO } from '../dtos/support-ticket.dto.js';

export function toSupportTicketDTO(entity: SupportTicket): SupportTicketDTO {
  return {
    id: entity.id,
    ticketNumber: entity.ticketNumber.value,
    patientId: entity.patientId,
    caseId: entity.caseId,
    type: entity.type,
    priority: entity.priority,
    status: entity.status,
    subject: entity.subject,
    description: entity.description,
    sourcePage: entity.sourcePage,
    assignedTo: entity.assignedTo,
    slaDeadline: entity.slaDeadline?.toISOString() ?? null,
    resolutionNote: entity.resolutionNote,
    resolvedAt: entity.resolvedAt?.toISOString() ?? null,
    version: entity.version,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toSupportTicketReplyDTO(entity: SupportTicketReply): SupportTicketReplyDTO {
  return {
    id: entity.id,
    ticketId: entity.ticketId,
    authorId: entity.authorId,
    authorRole: entity.authorRole,
    content: entity.content,
    isInternalNote: entity.isInternalNote,
    attachments: entity.attachments,
    createdAt: entity.createdAt.toISOString(),
  };
}
