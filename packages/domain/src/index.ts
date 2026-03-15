// Enums
export type {
  CaseStatus, CaseStage, RiskLevel, DocumentType,
  Sensitivity, DocumentStatus, ProgressType,
} from './enums/index.js';

// State machine
export { STATUS_TRANSITIONS } from './state-machine/case-status-transitions.js';
export { STAGE_ORDER } from './state-machine/case-stage-order.js';

// Value objects
export { CaseNumber } from './value-objects/case-number.js';

// Entities
export { Case } from './entities/case.entity.js';
export type { CaseProps } from './entities/case.entity.js';
export { Document } from './entities/document.entity.js';
export type { DocumentProps } from './entities/document.entity.js';
export { CaseProgress } from './entities/case-progress.entity.js';
export type { CaseProgressProps } from './entities/case-progress.entity.js';

// Ports
export type { ICaseRepository, CaseListQuery, CaseCountFilters, CaseStats } from './ports/case-repository.port.js';
export type { IDocumentRepository } from './ports/document-repository.port.js';
export type { ICaseProgressRepository } from './ports/case-progress-repository.port.js';
export type { IHospitalRepository, HospitalInfo } from './ports/hospital-repository.port.js';
export type { IPatientRepository, PatientBasicInfo } from './ports/patient-repository.port.js';
export type { IStorageService, PresignedUploadResult } from './ports/storage-service.port.js';
