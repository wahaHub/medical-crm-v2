import type { IServiceCatalogRepository } from '@medical-crm/domain';
import { QuoteTemplate } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { QuoteTemplateDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteTemplateDTO } from '../../mappers/service-catalog.mapper.js';

export interface CreateQuoteTemplateInput {
  name: string;
  conditionCategory?: string | null;
  lineItemsTemplate?: unknown;
  defaultValidDays?: number;
}

export class CreateQuoteTemplateUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    hospitalId: string,
    input: CreateQuoteTemplateInput,
    actor: Actor,
  ): Promise<QuoteTemplateDTO> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot manage quote templates');
    }

    const entity = new QuoteTemplate({
      id: generateId(),
      hospitalId,
      name: input.name,
      conditionCategory: input.conditionCategory ?? null,
      lineItemsTemplate: input.lineItemsTemplate ?? [],
      defaultValidDays: input.defaultValidDays ?? 30,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.repo.saveTemplate(entity);
    return toQuoteTemplateDTO(saved);
  }
}
