// Enums
export type {
  CaseStatus, CaseStage, RiskLevel, DocumentType,
  Sensitivity, DocumentStatus, ProgressType,
  ConsultationStatus, AISummaryStatus, TranscriptStatus,
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
export { Consultation } from './entities/consultation.entity.js';
export type { ConsultationProps } from './entities/consultation.entity.js';
export { ConsultationTranscript } from './entities/consultation-transcript.entity.js';
export type { ConsultationTranscriptProps } from './entities/consultation-transcript.entity.js';

// Ports
export type { ICaseRepository, CaseListQuery, CaseCountFilters, CaseStats } from './ports/case-repository.port.js';
export type { IDocumentRepository } from './ports/document-repository.port.js';
export type { ICaseProgressRepository } from './ports/case-progress-repository.port.js';
export type { IHospitalRepository, HospitalInfo } from './ports/hospital-repository.port.js';
export type { IPatientRepository, PatientBasicInfo } from './ports/patient-repository.port.js';
export type { IStorageService, PresignedUploadResult } from './ports/storage-service.port.js';
export type {
  IConsultationRepository,
  ConsultationListQuery,
  ConsultationCountFilters,
  ConsultationStats,
} from './ports/consultation-repository.port.js';
export type { IConsultationTranscriptRepository } from './ports/consultation-transcript-repository.port.js';

// Services
export { CaseAssignmentService } from './services/case-assignment.service.js';
