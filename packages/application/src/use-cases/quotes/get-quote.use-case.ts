import type { IQuoteRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';

export class GetQuoteUseCase {
  constructor(private readonly quoteRepo: IQuoteRepository) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    const entity = await this.quoteRepo.findById(quoteId);
    if (!entity) throw new NotFoundError(`Quote ${quoteId} not found`);

    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this quote');
    }

    return toQuoteDTO(entity);
  }
}
