import type { IQuoteRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError, ConflictError } from '@medical-crm/utils';

export interface PatientRejectQuoteInput {
  quoteId: string;
  patientId: string;
}

export class PatientRejectQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: PatientRejectQuoteInput): Promise<void> {
    const quote = await this.quoteRepo.findById(input.quoteId);
    if (!quote) throw new NotFoundError(`Quote ${input.quoteId} not found`);

    // Verify patient owns the case
    const caseEntity = await this.caseRepo.findById(quote.caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${quote.caseId} not found`);
    if (caseEntity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this quote');
    }

    if (quote.status !== 'PENDING') {
      throw new ConflictError('Quote is not in PENDING status');
    }
    if (quote.isDraft) {
      throw new ConflictError('Cannot reject a draft quote');
    }

    quote.reject();
    await this.quoteRepo.save(quote);
  }
}
