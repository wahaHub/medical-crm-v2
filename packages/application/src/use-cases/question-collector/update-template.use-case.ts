import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';

export interface UpdateTemplateInput {
  templateName?: string;
  category?: string;
  procedureTypes?: string[];
  questions?: unknown;
  isActive?: boolean;
}

export class UpdateTemplateUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(id: string, input: UpdateTemplateInput, actor: Actor): Promise<QCTemplateDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update templates');
    }

    const entity = await this.qcRepo.findTemplateById(id);
    if (!entity) {
      throw new NotFoundError(`Template ${id} not found`);
    }

    entity.update(input);
    const saved = await this.qcRepo.saveTemplate(entity);
    return toQCTemplateDTO(saved);
  }
}
