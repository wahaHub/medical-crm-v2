import type { ISupportTicketRepository, TicketListQuery } from '@medical-crm/domain';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';

export class ListTicketsUseCase {
  constructor(private readonly ticketRepo: ISupportTicketRepository) {}

  async execute(
    query: TicketListQuery,
    actor: Actor,
  ): Promise<{ data: SupportTicketDTO[]; total: number; page: number; limit: number }> {
    let result: { data: import('@medical-crm/domain').SupportTicket[]; total: number };

    if (actor.role === 'ADMIN') {
      // Admin sees all tickets
      result = await this.ticketRepo.findAll(query);
    } else {
      // Patient sees own tickets only
      result = await this.ticketRepo.findByPatientId(actor.userId, query);
    }

    return {
      data: result.data.map((e) => toSupportTicketDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
