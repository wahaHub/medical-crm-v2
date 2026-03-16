import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';

export interface ListTemplatesQuery {
  isActive?: boolean;
  category?: string;
  page: number;
  limit: number;
}

export class ListTemplatesUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(query: ListTemplatesQuery, actor: Actor): Promise<{ data: QCTemplateDTO[]; total: number }> {
    // Non-admins can only see active templates
    const effectiveQuery = { ...query };
    if (actor.role !== 'ADMIN') {
      effectiveQuery.isActive = true;
    }

    const result = await this.qcRepo.findAllTemplates(effectiveQuery);
    return {
      data: result.data.map(toQCTemplateDTO),
      total: result.total,
    };
  }
}
