// Phase 1 Enums
export type {
  CaseStatus, CaseStage, RiskLevel, DocumentType,
  Sensitivity, DocumentStatus, ProgressType,
} from './enums/index.js';

// Phase 2BC Enums
export type {
  HospitalStatus, HospitalType,
  ConversationCategory, MessageType, ModerationStatus,
  ConsultationStatus, AISummaryStatus, TranscriptStatus,
  MessageTaskKind, MessageTaskStatus,
} from './enums/index.js';

// Phase 2: Case Model Realignment Enums
export type {
  CaseAssignmentStatus, CaseTreatmentStage, AISummaryStatusType,
} from './enums/index.js';

// Phase 1 State machines
export { STATUS_TRANSITIONS } from './state-machine/case-status-transitions.js';
export { STAGE_ORDER } from './state-machine/case-stage-order.js';

// Phase 2BC State machines
export { HOSPITAL_STATUS_TRANSITIONS } from './state-machine/hospital-status-transitions.js';
export { CONSULTATION_STATUS_TRANSITIONS } from './state-machine/consultation-status-transitions.js';

// Phase 2: Case Model Realignment State machines
export { ASSIGNMENT_STATUS_TRANSITIONS } from './state-machine/assignment-status-transitions.js';
export { TREATMENT_STAGE_TRANSITIONS } from './state-machine/treatment-stage-transitions.js';

// Phase 1 Value objects
export { CaseNumber } from './value-objects/case-number.js';

// Phase 2BC Value objects
export { RegistrationToken } from './value-objects/registration-token.js';
export type { RegistrationTokenProps } from './value-objects/registration-token.js';

// Phase 1 Entities
export { Case } from './entities/case.entity.js';
export type { CaseProps } from './entities/case.entity.js';
export { Document } from './entities/document.entity.js';
export type { DocumentProps } from './entities/document.entity.js';
export { CaseProgress } from './entities/case-progress.entity.js';
export type { CaseProgressProps } from './entities/case-progress.entity.js';

// Phase 2BC Entities
export { Hospital } from './entities/hospital.entity.js';
export type { HospitalProps } from './entities/hospital.entity.js';
export { Conversation } from './entities/conversation.entity.js';
export type { ConversationProps } from './entities/conversation.entity.js';
export { Message } from './entities/message.entity.js';
export type { MessageProps, Attachment } from './entities/message.entity.js';
export { Consultation } from './entities/consultation.entity.js';
export type { ConsultationProps, VideoInfo } from './entities/consultation.entity.js';
export { ConsultationTranscript } from './entities/consultation-transcript.entity.js';
export type { ConsultationTranscriptProps, TranscriptEntry } from './entities/consultation-transcript.entity.js';

// Phase 1 Ports
export type { ICaseRepository, CaseListQuery, CaseCountFilters, CaseStats } from './ports/case-repository.port.js';
export type { IDocumentRepository } from './ports/document-repository.port.js';
export type { ICaseProgressRepository } from './ports/case-progress-repository.port.js';
export type { IHospitalRepository, HospitalInfo } from './ports/hospital-repository.port.js';
export type { IPatientRepository, PatientBasicInfo } from './ports/patient-repository.port.js';
export type { IStorageService, PresignedUploadResult } from './ports/storage-service.port.js';

// Phase 2BC Ports — Hospital
export type { IHospitalManagementRepository, HospitalListQuery } from './ports/hospital-management-repository.port.js';
export type { IRegistrationTokenRepository } from './ports/registration-token-repository.port.js';
export type { IHospitalSyncService } from './ports/hospital-sync-service.port.js';
export type { IKeycloakAdminService, KeycloakUser } from './ports/keycloak-admin-service.port.js';
export type { IUserRepository, CreateUserInput } from './ports/user-repository.port.js';

// Phase 2BC Ports — Messaging
export type { IConversationRepository, ConversationListQuery } from './ports/conversation-repository.port.js';
export type { IMessageRepository, MessageListQuery } from './ports/message-repository.port.js';
export type { IMessageTaskQueue, MessageTask } from './ports/message-task-queue.port.js';
export type { ITranslationService } from './ports/translation-service.port.js';

// Phase 2BC Ports — Consultations
export type {
  IConsultationRepository,
  ConsultationListQuery as ConsultationListQueryType,
  ConsultationCountFilters,
  ConsultationStats,
} from './ports/consultation-repository.port.js';
export type { IConsultationTranscriptRepository } from './ports/consultation-transcript-repository.port.js';

// Phase 3 Ports — Materials
export type {
  IMaterialsRepository,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
  MaterialsBeforeAfterCase,
} from './ports/materials-repository.port.js';

// Phase 2: TransactionRunner
export type { Transaction, TransactionRunner } from './ports/transaction-runner.port.js';

// Services
export { CaseAssignmentService } from './services/case-assignment.service.js';
