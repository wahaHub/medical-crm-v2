import type { QCCompletionStatus } from '../enums/index.js';

export interface QCResponseProps {
  id: string;
  caseId: string;
  templateId: string;
  userId: string;
  responses: unknown;
  extractedData: unknown | null;
  riskFlags: string[];
  completionStatus: QCCompletionStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class QCResponse {
  readonly id: string;
  caseId: string;
  templateId: string;
  userId: string;
  responses: unknown;
  extractedData: unknown | null;
  riskFlags: string[];
  completionStatus: QCCompletionStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: QCResponseProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.templateId = props.templateId;
    this.userId = props.userId;
    this.responses = props.responses;
    this.extractedData = props.extractedData;
    this.riskFlags = props.riskFlags;
    this.completionStatus = props.completionStatus;
    this.submittedAt = props.submittedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  saveDraft(responses: unknown): void {
    this.responses = responses;
    this.completionStatus = 'IN_PROGRESS';
    this.updatedAt = new Date();
  }

  submit(responses: unknown, riskFlags?: string[], extractedData?: unknown): void {
    this.responses = responses;
    this.completionStatus = 'COMPLETED';
    this.submittedAt = new Date();
    if (riskFlags) this.riskFlags = riskFlags;
    if (extractedData !== undefined) this.extractedData = extractedData;
    this.updatedAt = new Date();
  }
}
