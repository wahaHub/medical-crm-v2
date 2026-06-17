import type { ISupportTicketRepository, TicketStatus } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class UpdateTicketStatusUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    id: string,
    status: TicketStatus,
    actor: Actor,
  ): Promise<SupportTicketDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can update ticket status');

    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    await this.adminAccess?.assertActorCanAccessCaseOrPatient(actor, { caseId: ticket.caseId, patientId: ticket.patientId });

    ticket.transitionStatus(status);
    const saved = await this.ticketRepo.save(ticket);
    return toSupportTicketDTO(saved);
  }
}
