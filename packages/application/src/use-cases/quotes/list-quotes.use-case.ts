import type { IQuoteRepository, ICaseRepository, QuoteListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';

export class ListQuotesUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(query: QuoteListQuery, actor: Actor): Promise<{ data: QuoteDTO[]; total: number; page: number; limit: number }> {
    const effectiveQuery = { ...query };
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      effectiveQuery.hospitalId = actor.hospitalId;
    }

    // PATIENT must provide caseId and can only see quotes for own cases
    if (actor.role === 'PATIENT') {
      if (!effectiveQuery.caseId) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      const caseEntity = await this.caseRepo.findById(effectiveQuery.caseId);
      if (!caseEntity || caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Access denied to this case');
      }
    }

    if (effectiveQuery.hospitalId) {
      const result = await this.quoteRepo.findByHospitalId(effectiveQuery.hospitalId, effectiveQuery);
      return {
        data: result.data.map((e) => toQuoteDTO(e)),
        total: result.total,
        page: query.page,
        limit: query.limit,
      };
    }

    if (effectiveQuery.caseId) {
      const data = await this.quoteRepo.findByCaseId(effectiveQuery.caseId);
      return {
        data: data.map((e) => toQuoteDTO(e)),
        total: data.length,
        page: query.page,
        limit: query.limit,
      };
    }

    return { data: [], total: 0, page: query.page, limit: query.limit };
  }
}
