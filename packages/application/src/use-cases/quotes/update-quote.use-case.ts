import type { IQuoteRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError, ValidationError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';

export interface UpdateQuoteInput {
  totalAmount?: string;
  treatmentPlan?: string;
  lineItems?: unknown;
  notes?: string;
  validUntil?: string;
}

export class UpdateQuoteUseCase {
  constructor(private readonly quoteRepo: IQuoteRepository) {}

  async execute(quoteId: string, input: UpdateQuoteInput, actor: Actor): Promise<QuoteDTO> {
    if (actor.role !== 'HOSPITAL') throw new ForbiddenError('Only hospitals can update quotes');

    const entity = await this.quoteRepo.findById(quoteId);
    if (!entity) throw new NotFoundError(`Quote ${quoteId} not found`);
    if (entity.hospitalId !== actor.hospitalId) throw new ForbiddenError('Can only update your own quotes');
    if (!entity.isDraft) throw new ValidationError('Can only update draft quotes');

    if (input.totalAmount !== undefined) entity.totalAmount = input.totalAmount;
    if (input.treatmentPlan !== undefined) entity.treatmentPlan = input.treatmentPlan;
    if (input.lineItems !== undefined) entity.lineItems = input.lineItems;
    if (input.notes !== undefined) entity.notes = input.notes;
    if (input.validUntil !== undefined) entity.validUntil = new Date(input.validUntil);
    entity.updatedAt = new Date();

    const saved = await this.quoteRepo.save(entity);
    return toQuoteDTO(saved);
  }
}
