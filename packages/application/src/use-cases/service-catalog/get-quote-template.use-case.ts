import type { IServiceCatalogRepository } from '@medical-crm/domain';
import type { QuoteTemplateDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteTemplateDTO } from '../../mappers/service-catalog.mapper.js';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';

export class GetQuoteTemplateUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(id: string, actor: Actor): Promise<QuoteTemplateDTO> {
    const template = await this.repo.findTemplateById(id);
    if (!template) {
      throw new NotFoundError('Quote template not found');
    }

    if (actor.role === 'HOSPITAL' && actor.hospitalId !== template.hospitalId) {
      throw new ForbiddenError('Hospital users can only view their own templates');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot view quote templates');
    }

    return toQuoteTemplateDTO(template);
  }
}
