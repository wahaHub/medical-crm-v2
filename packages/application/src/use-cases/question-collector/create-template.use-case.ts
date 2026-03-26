import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { QCTemplate } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';
import { normalizeQCQuestions, extractTranslatableQCFields } from '../../services/qc-normalization.js';

export interface CreateTemplateInput {
  templateName: string;
  category: string;
  procedureTypes?: string[];
  questions: unknown;
  isActive?: boolean;
}

export class CreateTemplateUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly translationTaskService: TranslationTaskService,
  ) {}

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

    const normalizedQuestions = normalizeQCQuestions(input.questions);
    const translatableFields = {
      templateName: input.templateName,
      ...extractTranslatableQCFields(normalizedQuestions),
    };
    await this.translationTaskService.enqueue({
      sourceDb: 'crm',
      entityType: 'qc_template',
      entityId: saved.id,
      fieldsToTranslate: translatableFields,
    });

    return toQCTemplateDTO(saved);
  }
}
