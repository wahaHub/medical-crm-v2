export interface QCTemplateDTO {
  id: string;
  templateName: string;
  category: string;
  procedureTypes: string[];
  questions: unknown;
  version: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QCResponseDTO {
  id: string;
  caseId: string;
  templateId: string;
  userId: string;
  responses: unknown;
  extractedData: unknown | null;
  riskFlags: string[];
  completionStatus: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QCCustomizationDTO {
  id: string;
  templateId: string;
  hospitalId: string;
  customizedQuestions: unknown;
  customizedBy: string | null;
  customizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
