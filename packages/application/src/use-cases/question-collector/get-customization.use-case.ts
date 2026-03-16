import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { QCCustomizationDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCCustomizationDTO } from '../../mappers/question-collector.mapper.js';

export class GetCustomizationUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(templateId: string, actor: Actor): Promise<QCCustomizationDTO | null> {
    if (actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only hospital users can view customizations');
    }
    if (!actor.hospitalId) {
      throw new ForbiddenError('Hospital user must be associated with a hospital');
    }

    // Verify template exists
    const template = await this.qcRepo.findTemplateById(templateId);
    if (!template) {
      throw new NotFoundError(`Template ${templateId} not found`);
    }

    const entity = await this.qcRepo.findCustomization(templateId, actor.hospitalId);
    if (!entity) return null;

    return toQCCustomizationDTO(entity);
  }
}
