import type { DocumentType, Sensitivity, DocumentStatus } from '../enums/index.js';

export interface DocumentProps {
  id: string;
  caseId: string;
  uploadedById: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  documentType: DocumentType;
  sensitivity: Sensitivity;
  language: string;
  isTranslated: boolean;
  status: DocumentStatus;
  /** Case Lifecycle Phase 1: optional treatment-stage tag for archiving materials by stage */
  stageTag?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Document {
  readonly id: string;
  caseId: string;
  uploadedById: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  documentType: DocumentType;
  sensitivity: Sensitivity;
  language: string;
  isTranslated: boolean;
  status: DocumentStatus;
  stageTag: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: DocumentProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.uploadedById = props.uploadedById;
    this.fileName = props.fileName;
    this.fileSize = props.fileSize;
    this.mimeType = props.mimeType;
    this.storageKey = props.storageKey;
    this.documentType = props.documentType;
    this.sensitivity = props.sensitivity;
    this.language = props.language;
    this.isTranslated = props.isTranslated;
    this.status = props.status;
    this.stageTag = props.stageTag ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
