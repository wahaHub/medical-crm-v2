import type { ISupportTicketRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';

export class AssignTicketUseCase {
  constructor(private readonly ticketRepo: ISupportTicketRepository) {}

  async execute(
    id: string,
    assignedTo: string,
    actor: Actor,
  ): Promise<SupportTicketDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can assign tickets');

    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);

    ticket.assign(assignedTo);
    const saved = await this.ticketRepo.save(ticket);
    return toSupportTicketDTO(saved);
  }
}
