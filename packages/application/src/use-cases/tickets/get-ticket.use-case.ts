import type { ISupportTicketRepository, ISupportTicketReplyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO, SupportTicketReplyDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO, toSupportTicketReplyDTO } from '../../mappers/support-ticket.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetTicketUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly replyRepo: ISupportTicketReplyRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    id: string,
    actor: Actor,
  ): Promise<{ ticket: SupportTicketDTO; replies: SupportTicketReplyDTO[] }> {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);

    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCaseOrPatient(actor, { caseId: ticket.caseId, patientId: ticket.patientId });
    } else if (actor.role === 'HOSPITAL') {
      if (!ticket.caseId) {
        throw new ForbiddenError('Not authorized to view this ticket');
      }
      await this.adminAccess?.assertActorCanAccessCase(actor, ticket.caseId);
    } else if (ticket.patientId !== actor.userId) {
      throw new ForbiddenError('Not authorized to view this ticket');
    }

    const replies = await this.replyRepo.findByTicketId(id);

    // Filter out internal notes for non-admin users
    const visibleReplies = actor.role === 'ADMIN'
      ? replies
      : replies.filter((r) => !r.isInternalNote);

    return {
      ticket: toSupportTicketDTO(ticket),
      replies: visibleReplies.map((r) => toSupportTicketReplyDTO(r)),
    };
  }
}
