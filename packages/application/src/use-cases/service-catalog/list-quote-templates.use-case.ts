import type { IServiceCatalogRepository, QuoteTemplateListQuery } from '@medical-crm/domain';
import type { QuoteTemplateDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteTemplateDTO } from '../../mappers/service-catalog.mapper.js';
import { ForbiddenError } from '@medical-crm/utils';

export class ListQuoteTemplatesUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    hospitalId: string,
    query: QuoteTemplateListQuery,
    actor: Actor,
  ): Promise<{ data: QuoteTemplateDTO[]; total: number; page: number; limit: number }> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only view their own templates');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot view quote templates');
    }

    const result = await this.repo.findTemplatesByHospitalId(hospitalId, query);

    return {
      data: result.data.map((e) => toQuoteTemplateDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
