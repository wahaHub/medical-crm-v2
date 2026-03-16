import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export interface ListResponsesQuery {
  caseId?: string;
  completionStatus?: string;
  hasRiskFlags?: boolean;
  page: number;
  limit: number;
}

export class ListResponsesUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(query: ListResponsesQuery, actor: Actor): Promise<{ data: QCResponseDTO[]; total: number }> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can list all responses');
    }

    const result = await this.qcRepo.findAllResponses(query);
    return {
      data: result.data.map(toQCResponseDTO),
      total: result.total,
    };
  }
}
