import type { ICaseRepository, IQuoteRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class ResendQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospitals can resend quotes');

    const quote = await this.quoteRepo.findById(quoteId);
    if (!quote) throw new NotFoundError(`Quote ${quoteId} not found`);
    if (quote.hospitalId !== actor.hospitalId) throw new ForbiddenError('Can only resend your own quotes');
    if (this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(quote.caseId);
      if (!caseEntity) throw new NotFoundError(`Case ${quote.caseId} not found`);
      await this.adminAccess.assertCaseNotExcludedByPatientEmail(caseEntity);
    }

    quote.resend(); // REJECTED/EXPIRED→PENDING, version++
    const saved = await this.quoteRepo.save(quote);

    // Update CHC→QUOTED
    const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId);
    if (chc && (chc.subStatus === 'REJECTED' || chc.subStatus === 'EXPIRED')) {
      chc.transitionSubStatus('QUOTED');
      await this.chcRepo.save(chc);
    }

    return toQuoteDTO(saved);
  }
}
