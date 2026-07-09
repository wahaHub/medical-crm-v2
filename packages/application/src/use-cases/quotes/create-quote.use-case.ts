import type { ICaseRepository, IQuoteRepository } from '@medical-crm/domain';
import { Quote, QuoteNumber } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface CreateQuoteInput {
  caseId: string;
  hospitalId: string;
  totalAmount: string;
  currency?: string;
  validUntil: string;
  treatmentPlan?: string;
  lineItems?: unknown;
  notes?: string;
}

export class CreateQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: CreateQuoteInput, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospitals can create quotes');
    if (actor.hospitalId !== input.hospitalId) throw new ForbiddenError('Can only create quotes for your own hospital');
    if (this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(input.caseId);
      if (!caseEntity) throw new NotFoundError(`Case ${input.caseId} not found`);
      await this.adminAccess.assertCaseNotExcludedByPatientEmail(caseEntity);
    }

    const quoteNumberStr = await this.quoteRepo.nextQuoteNumber();
    const entity = new Quote({
      id: generateId(),
      caseId: input.caseId,
      hospitalId: input.hospitalId,
      quoteNumber: new QuoteNumber(quoteNumberStr),
      version: 1,
      status: 'PENDING',
      isDraft: true,
      totalAmount: input.totalAmount,
      currency: input.currency ?? 'USD',
      validUntil: new Date(input.validUntil),
      treatmentPlan: input.treatmentPlan ?? null,
      lineItems: input.lineItems ?? null,
      notes: input.notes ?? null,
      sentAt: null,
      createdBy: actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.quoteRepo.save(entity);
    return toQuoteDTO(saved);
  }
}
