import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { QCCustomization } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { QCCustomizationDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCCustomizationDTO } from '../../mappers/question-collector.mapper.js';

export interface CustomizeQuestionsInput {
  customizedQuestions: unknown;
}

export class CustomizeQuestionsUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(templateId: string, input: CustomizeQuestionsInput, actor: Actor): Promise<QCCustomizationDTO> {
    if (actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only hospital users can customize questions');
    }
    if (!actor.hospitalId) {
      throw new ForbiddenError('Hospital user must be associated with a hospital');
    }

    // Verify template exists
    const template = await this.qcRepo.findTemplateById(templateId);
    if (!template) {
      throw new NotFoundError(`Template ${templateId} not found`);
    }

    // Check for existing customization
    let entity = await this.qcRepo.findCustomization(templateId, actor.hospitalId);

    if (entity) {
      entity.update(input.customizedQuestions, actor.userId);
    } else {
      entity = new QCCustomization({
        id: generateId(),
        templateId,
        hospitalId: actor.hospitalId,
        customizedQuestions: input.customizedQuestions,
        customizedBy: actor.userId,
        customizedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const saved = await this.qcRepo.saveCustomization(entity);
    return toQCCustomizationDTO(saved);
  }
}
