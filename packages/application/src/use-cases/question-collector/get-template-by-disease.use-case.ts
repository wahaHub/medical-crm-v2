import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { QCTemplateDTO } from '../../dtos/question-collector.dto.js';
import { toQCTemplateDTO } from '../../mappers/question-collector.mapper.js';

/**
 * Known Disease selectors.
 * "DEFAULT" is a catch-all used by the China patient medical-form flow.
 * Maps directly to the `category` field on QCTemplate.
 */
export type DiseaseSelector = 'DEFAULT' | (string & Record<never, never>);

export interface GetTemplateByDiseaseResult {
  template: PatientSafeTemplateDTO;
}

/**
 * Patient-safe projection of QCTemplateDTO.
 * Omits admin-only fields (createdBy, raw version counter).
 * Exposes the fields needed by the patient medical-form modal.
 */
export interface PatientSafeTemplateDTO {
  id: string;
  templateName: string;
  category: string;
  procedureTypes: string[];
  questions: unknown;
  translations: Record<string, Record<string, unknown>>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toPatientSafeDTO(dto: QCTemplateDTO): PatientSafeTemplateDTO {
  return {
    id: dto.id,
    templateName: dto.templateName,
    category: dto.category,
    procedureTypes: dto.procedureTypes,
    questions: dto.questions,
    translations: dto.translations,
    isActive: dto.isActive,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export class GetTemplateByDiseaseUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  /**
   * Resolves the single active template for a given disease selector.
   * Only active templates are returned — inactive templates are invisible to patients.
   * This path is READ-ONLY; no mutation is possible through this use case.
   */
  async execute(disease: DiseaseSelector): Promise<GetTemplateByDiseaseResult> {
    // Disease selector maps 1:1 to template category.
    const category = disease;

    const entity = await this.qcRepo.findActiveTemplateByCategory(category);
    if (!entity) {
      throw new NotFoundError(`No active template found for disease selector "${disease}"`);
    }

    return {
      template: toPatientSafeDTO(toQCTemplateDTO(entity)),
    };
  }
}
