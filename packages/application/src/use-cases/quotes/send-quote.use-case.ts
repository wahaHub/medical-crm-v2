import type { IQuoteRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';

export class SendQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospitals can send quotes');

    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) throw new NotFoundError(`Quote ${quoteId} not found`);
    if (quote.hospitalId !== actor.hospitalId) throw new ForbiddenError('Can only send your own quotes');

    quote.send(); // sets isDraft=false, sentAt
    const saved = await this.quoteRepo.save(quote);

    // Update CHC: transition to QUOTED, set firstReplyAt if not set
    const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId);
    if (chc) {
      chc.transitionSubStatus('QUOTED');
      chc.quoteId = quote.id;
      if (!chc.firstReplyAt) chc.firstReplyAt = new Date();
      await this.chcRepo.save(chc);
    }

    return toQuoteDTO(saved);
  }
}
