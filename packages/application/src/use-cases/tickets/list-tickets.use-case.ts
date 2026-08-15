import type { ISupportTicketRepository, TicketListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { SupportTicketDTO } from '../../dtos/support-ticket.dto.js';
import type { Actor } from '../../types/actor.js';
import { toSupportTicketDTO } from '../../mappers/support-ticket.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';

export class ListTicketsUseCase {
  constructor(private readonly ticketRepo: ISupportTicketRepository) {}

  async execute(
    query: TicketListQuery,
    actor: Actor,
  ): Promise<{ data: SupportTicketDTO[]; total: number; page: number; limit: number }> {
    let result: { data: import('@medical-crm/domain').SupportTicket[]; total: number };

    if (actor.role === 'ADMIN') {
      // Admin sees tickets through admin portal case-page filters.
      const patientSiteScope = getAdminPatientSiteScope(actor);
      const effectiveQuery = withDefaultPatientEmailExclusions(
        patientSiteScope ? { ...query, patientSiteScope } : query,
      );
      result = await this.ticketRepo.findAll(effectiveQuery);
    } else if (actor.role === 'PATIENT') {
      // Patient sees own tickets only
      result = await this.ticketRepo.findByPatientId(actor.userId, query);
    } else {
      throw new ForbiddenError('Only admins and patients can list tickets');
    }

    return {
      data: result.data.map((e) => toSupportTicketDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
