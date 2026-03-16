import type { QCTemplate } from '../entities/qc-template.entity.js';
import type { QCResponse } from '../entities/qc-response.entity.js';
import type { QCCustomization } from '../entities/qc-customization.entity.js';

export interface QCTemplateListQuery {
  isActive?: boolean;
  category?: string;
  page: number;
  limit: number;
}

export interface QCResponseListQuery {
  caseId?: string;
  completionStatus?: string;
  hasRiskFlags?: boolean;
  page: number;
  limit: number;
}

export interface IQuestionCollectorRepository {
  // Templates
  findTemplateById(id: string): Promise<QCTemplate | null>;
  findAllTemplates(query: QCTemplateListQuery): Promise<{ data: QCTemplate[]; total: number }>;
  saveTemplate(entity: QCTemplate): Promise<QCTemplate>;

  // Responses
  findResponseById(id: string): Promise<QCResponse | null>;
  findResponseByCaseId(caseId: string): Promise<QCResponse | null>;
  findAllResponses(query: QCResponseListQuery): Promise<{ data: QCResponse[]; total: number }>;
  saveResponse(entity: QCResponse): Promise<QCResponse>;

  // Customizations
  findCustomization(templateId: string, hospitalId: string): Promise<QCCustomization | null>;
  saveCustomization(entity: QCCustomization): Promise<QCCustomization>;
}
