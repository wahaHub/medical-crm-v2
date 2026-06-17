import type { IQuoteRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class CompareQuotesUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<QuoteDTO[]> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can compare quotes');
    if (this.adminAccess) {
      await this.adminAccess.assertActorCanAccessCase(actor, caseId);
    }

    const quotes = await this.quoteRepo.findByCaseId(caseId);
    return quotes.map((q) => toQuoteDTO(q));
  }
}
