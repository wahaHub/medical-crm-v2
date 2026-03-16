import type { IQuoteRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError, ConflictError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';

export class RejectQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can reject quotes');

    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) throw new NotFoundError(`Quote ${quoteId} not found`);
    if (quote.status !== 'PENDING') throw new ConflictError('Quote is not in PENDING status');

    quote.reject();
    const saved = await this.quoteRepo.save(quote);

    // Update CHC to REJECTED
    const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId);
    if (chc && chc.subStatus === 'QUOTED') {
      chc.transitionSubStatus('REJECTED');
      chc.patientRejectedAt = new Date();
      await this.chcRepo.save(chc);
    }

    return toQuoteDTO(saved);
  }
}
