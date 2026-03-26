import type { QCTemplate, QCResponse, QCCustomization } from '@medical-crm/domain';
import type { QCTemplateDTO, QCResponseDTO, QCCustomizationDTO } from '../dtos/question-collector.dto.js';

export function toQCTemplateDTO(entity: QCTemplate): QCTemplateDTO {
  return {
    id: entity.id,
    templateName: entity.templateName,
    category: entity.category,
    procedureTypes: entity.procedureTypes,
    questions: entity.questions,
    translations: entity.translations,
    version: entity.version,
    isActive: entity.isActive,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toQCResponseDTO(entity: QCResponse): QCResponseDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    templateId: entity.templateId,
    userId: entity.userId,
    responses: entity.responses,
    extractedData: entity.extractedData,
    riskFlags: entity.riskFlags,
    completionStatus: entity.completionStatus,
    translations: entity.translations,
    submittedAt: entity.submittedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toQCCustomizationDTO(entity: QCCustomization): QCCustomizationDTO {
  return {
    id: entity.id,
    templateId: entity.templateId,
    hospitalId: entity.hospitalId,
    customizedQuestions: entity.customizedQuestions,
    customizedBy: entity.customizedBy,
    customizedAt: entity.customizedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
