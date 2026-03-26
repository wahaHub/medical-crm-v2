import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';
import { normalizeQCQuestions, extractTranslatableQCFields } from '../../services/qc-normalization.js';

export interface UpdateTemplateInput {
  templateName?: string;
  category?: string;
  procedureTypes?: string[];
  questions?: unknown;
  isActive?: boolean;
}

export class UpdateTemplateUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

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

    const translatableFields: Record<string, unknown> = {};
    if (input.templateName !== undefined) translatableFields.templateName = input.templateName;
    if (input.questions !== undefined) {
      const normalizedQuestions = normalizeQCQuestions(input.questions);
      Object.assign(translatableFields, extractTranslatableQCFields(normalizedQuestions));
    }
    if (Object.keys(translatableFields).length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb: 'crm',
        entityType: 'qc_template',
        entityId: saved.id,
        fieldsToTranslate: translatableFields,
      });
    }

    return toQCTemplateDTO(saved);
  }
}
