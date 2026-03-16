import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { QCTemplate } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';

export interface CreateTemplateInput {
  templateName: string;
  category: string;
  procedureTypes?: string[];
  questions: unknown;
  isActive?: boolean;
}

export class CreateTemplateUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(input: CreateTemplateInput, actor: Actor): Promise<QCTemplateDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create templates');
    }

    const entity = new QCTemplate({
      id: generateId(),
      templateName: input.templateName,
      category: input.category,
      procedureTypes: input.procedureTypes ?? [],
      questions: input.questions,
      version: 1,
      isActive: input.isActive ?? true,
      createdBy: actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.qcRepo.saveTemplate(entity);
    return toQCTemplateDTO(saved);
  }
}
