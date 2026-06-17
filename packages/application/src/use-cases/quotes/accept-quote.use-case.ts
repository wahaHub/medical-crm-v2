import type { IQuoteRepository, ICHCRepository, ICaseRepository, TransactionRunner, Transaction } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, ConflictError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class AcceptQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly txRunner: TransactionRunner,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    // Only ADMIN can accept quotes (on behalf of patient)
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can accept quotes');

    return this.txRunner.run(async (tx: Transaction) => {
      // 1. Load and validate quote
      const quote = await this.quoteRepo.findById(quoteId, tx);
      if (!quote) throw new NotFoundError(`Quote ${quoteId} not found`);
      const caseEntity = await this.caseRepo.findById(quote.caseId, tx);
      if (!caseEntity) throw new NotFoundError('Case not found');
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caseEntity);
      if (quote.status !== 'PENDING') throw new ConflictError('Quote is not in PENDING status');
      if (quote.isDraft) throw new ConflictError('Cannot accept a draft quote');

      // 2. Accept this quote
      quote.accept();
      await this.quoteRepo.save(quote, tx);

      // 3. Accept this CHC
      const chc = await this.chcRepo.findByCaseAndHospital(quote.caseId, quote.hospitalId, tx);
      if (!chc) throw new NotFoundError('CaseHospitalContact not found');
      chc.transitionSubStatus('ACCEPTED');
      chc.patientAcceptedAt = new Date();
      await this.chcRepo.save(chc, tx);

      // 4. Reject all other CHCs (DISTRIBUTED, NEED_INFO, QUOTED -> REJECTED)
      await this.chcRepo.rejectOthersByCaseExcept(quote.caseId, chc.id, tx);

      // 5. Reject all other pending quotes for this case
      await this.quoteRepo.rejectPendingByCaseExcept(quote.caseId, quote.id, tx);

      // 6. Assign the case to this hospital
      caseEntity.transitionAssignmentStatus('ASSIGNED');
      caseEntity.assignedHospitalId = quote.hospitalId;
      caseEntity.assignedAt = new Date();
      await this.caseRepo.save(caseEntity, tx);

      return toQuoteDTO(quote);
    });
  }
}
