import type { ICaseRepository, IQuoteRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class SendQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospitals can send quotes');

    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) throw new NotFoundError(`Quote ${quoteId} not found`);
    if (quote.hospitalId !== actor.hospitalId) throw new ForbiddenError('Can only send your own quotes');
    if (this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(quote.caseId);
      if (!caseEntity) throw new NotFoundError(`Case ${quote.caseId} not found`);
      await this.adminAccess.assertCaseNotExcludedByPatientEmail(caseEntity);
    }

    quote.send(); // sets isDraft=false, sentAt
    const saved = await this.quoteRepo.save(quote);

    // Update CHC: transition to QUOTED, set firstReplyAt if not set
    const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId);
    if (chc) {
      if (chc.subStatus !== 'QUOTED') {
        chc.transitionSubStatus('QUOTED');
      }
      chc.quoteId = quote.id;
      if (!chc.firstReplyAt) chc.firstReplyAt = new Date();
      await this.chcRepo.save(chc);
    }

    return toQuoteDTO(saved);
  }
}
