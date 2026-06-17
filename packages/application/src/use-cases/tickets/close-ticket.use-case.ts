import type { ISupportTicketRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class CloseTicketUseCase {
  constructor(
    private readonly ticketRepo: ISupportTicketRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    id: string,
    actor: Actor,
  ): Promise<SupportTicketDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can close tickets');

    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    await this.adminAccess?.assertActorCanAccessCaseOrPatient(actor, { caseId: ticket.caseId, patientId: ticket.patientId });

    ticket.close();
    const saved = await this.ticketRepo.save(ticket);
    return toSupportTicketDTO(saved);
  }
}
