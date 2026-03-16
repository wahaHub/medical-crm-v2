import type { ISupportTicketRepository, TicketStatus } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';

export class UpdateTicketStatusUseCase {
  constructor(private readonly ticketRepo: ISupportTicketRepository) {}

  async execute(
    id: string,
    status: TicketStatus,
    actor: Actor,
  ): Promise<SupportTicketDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can update ticket status');

    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);

    ticket.transitionStatus(status);
    const saved = await this.ticketRepo.save(ticket);
    return toSupportTicketDTO(saved);
  }
}
