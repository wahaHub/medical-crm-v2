export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED' | 'MERGED';
export type CaseStage =
  | 'PENDING_ASSIGNMENT'
  | 'TRANSFERRED_TO_HOSPITAL'
  | 'HOSPITAL_CONTACTED'
  | 'CONSULTATION_SCHEDULED'
  | 'IN_TREATMENT'
  | 'TREATMENT_COMPLETED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DocumentType =
  | 'LAB' | 'IMAGING' | 'DISCHARGE' | 'PRESCRIPTION'
  | 'ID' | 'DIAGNOSIS' | 'QUOTE' | 'INVITATION' | 'OTHER';
export type Sensitivity = 'PHI_HIGH' | 'PHI_MED' | 'PHI_LOW';
export type DocumentStatus = 'PENDING' | 'ACTIVE' | 'DELETED';
export type ProgressType =
  | 'STATUS_CHANGE' | 'DOCUMENT_UPLOAD' | 'VIDEO_CONSULTATION'
  | 'MESSAGE' | 'APPOINTMENT';

// Hospital
export type HospitalStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
export type HospitalType = 'COSMETIC' | 'REGULAR';
export type HospitalSite = 'cosmetic' | 'china' | 'global';

// Messaging
export type ConversationCategory = 'HOSPITAL' | 'PATIENT' | 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
export type ModerationStatus = 'ALLOWED' | 'BLOCKED' | 'REVIEW';

// Consultations
export type ConsultationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AISummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Message Tasks
export type MessageTaskKind = 'TRANSLATE' | 'SUMMARIZE';
export type MessageTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Phase 2: Case Model Realignment
export type CaseAssignmentStatus = 'UNASSIGNED' | 'ASSIGNED';
export type CaseTreatmentStage = 'INTAKE' | 'CONFIRMED' | 'IN_TREATMENT' | 'POST_TREATMENT' | 'COMPLETED' | 'FOLLOW_UP';

// Case Lifecycle Phase 1: how the case entered the system
export type CaseSourceChannel = 'WEB_ONBOARDING' | 'MANUAL' | 'EMAIL' | 'WHATSAPP' | 'PHONE_CALL' | 'REFERRAL';
export type AISummaryStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Phase 2 M1: CHC + Quotes
export type CHCSubStatus = 'DISTRIBUTED' | 'NEED_INFO' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REMOVED';
export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export const HOSPITAL_CASE_READ_CHC_STATUSES = ['DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED'] as const satisfies readonly CHCSubStatus[];

// Phase 2 M2: Events / Timeline
export type CaseEventType =
  | 'CASE_CREATED' | 'CASE_DISTRIBUTED' | 'CASE_ASSIGNED' | 'CASE_STATUS_CHANGED' | 'CASE_STAGE_ADVANCED'
  | 'HOSPITALS_SELECTED' | 'HOSPITAL_REPLIED' | 'HOSPITAL_NEED_INFO' | 'HOSPITAL_REMOVED'
  | 'QUOTE_SENT' | 'QUOTE_ACCEPTED' | 'QUOTE_REJECTED' | 'QUOTE_EXPIRED' | 'QUOTE_RESENT'
  | 'MESSAGE_SENT' | 'MESSAGE_RECEIVED'
  | 'QUESTIONNAIRE_SUBMITTED' | 'CONSULTATION_SCHEDULED' | 'CONSULTATION_COMPLETED'
  | 'DOCUMENT_UPLOADED'
  | 'ORDER_PLACED' | 'ORDER_STATUS_CHANGED'
  | 'MILESTONE_ADDED' | 'MILESTONE_UPDATED' | 'JOURNEY_UPDATED'
  | 'TICKET_CREATED' | 'TICKET_RESOLVED'
  | 'AI_SUMMARY_GENERATED'
  | 'ADMIN_NOTE'
  | 'PATIENT_MERGED' | 'CASE_MERGED';

export type ActorType = 'PATIENT' | 'HOSPITAL' | 'ADMIN' | 'SYSTEM';

// Audit log events (mirrors the AuditEvent pgEnum)
export type AuditEvent =
  | 'DOC_UPLOAD' | 'DOC_VIEW' | 'DOC_DOWNLOAD' | 'DOC_DELETE'
  | 'DOC_SHARE_LINK_CREATED' | 'DOC_SHARE_LINK_USED'
  | 'CASE_CREATED' | 'CASE_ASSIGNED' | 'CASE_REVOKED' | 'CASE_STATUS_CHANGED'
  | 'USER_LOGIN' | 'USER_LOGOUT'
  | 'PATIENT_MERGED' | 'CASE_MERGED';

// Phase 2 M3: Support Tickets
export type TicketType = 'ACCOUNT_ISSUES' | 'PAYMENT_PROBLEMS' | 'HOSPITAL_COMMUNICATION' | 'DOCUMENT_HELP' | 'VISA_TRAVEL' | 'GENERAL_QUESTIONS' | 'FEEDBACK' | 'AI_ESCALATION';
export type TicketPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING_INFO' | 'RESOLVED' | 'CLOSED';
export type TicketReplyRole = 'ADMIN' | 'PATIENT';
export type AiChatSessionStatus = 'ACTIVE' | 'ESCALATED' | 'CLOSED';
export type ChatAutomationMode = 'mechanical' | 'ai' | 'human';
export type AiChatRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type AiChatIntent = 'FAQ' | 'CONSULT' | 'UNKNOWN' | 'SAFETY';
export type AiChatRiskLevel = 'NORMAL' | 'SENSITIVE' | 'CRISIS';
export type AiChatNextAction =
  | 'ANSWER'
  | 'CONSULT_CONVERSION'
  | 'CREATE_CASE'
  | 'REQUEST_DOCS'
  | 'ESCALATE'
  | 'SAFETY'
  | 'ANSWER_FAQ'
  | 'EXPLAIN_DOC_UPLOAD'
  | 'EXPLAIN_MEDICAL_TRAVEL_PROCESS'
  | 'EXPLAIN_CONSULT_PROCESS'
  | 'EXPLORE_HOSPITAL_RECOMMENDATIONS'
  | 'SHOW_HOSPITAL_RECOMMENDATIONS'
  | 'REQUEST_DOC_UPLOAD'
  | 'INVITE_ONLINE_CONSULT'
  | 'SHOW_PACKAGE'
  | 'HUMAN_HANDOFF'
  | 'SAFETY_HANDOFF';
export type AiSyncAction = 'UPSERT' | 'DELETE';
export type AiSyncStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

// Phase 2 M4: Orders + Packages
export type PackageType =
  | 'CONSULTATION'
  | 'HEALTH_CHECKUP'
  | 'SECOND_OPINION'
  | 'VISA_PACKAGE'
  | 'INSURANCE'
  | 'ACCOMMODATION'
  | 'TREATMENT_DEPOSIT'
  | 'TRANSLATION';
export type PackageStatus = 'DRAFT' | 'PUBLISHED';
export type OrderType = PackageType;
export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

// Phase 2 M5: Journey + Milestones
export type MilestoneEventType =
  | 'FLIGHT_ARRIVAL' | 'FLIGHT_DEPARTURE'
  | 'HOTEL_CHECKIN' | 'HOTEL_CHECKOUT'
  | 'HOSPITAL_APPOINTMENT' | 'PRE_OP_EXAM' | 'SURGERY_DATE' | 'POST_OP_CHECKUP'
  | 'MEDICATION_SCHEDULE' | 'FOLLOW_UP_REMOTE'
  | 'VISA_APPLICATION' | 'VISA_APPROVED'
  | 'INSURANCE_CONFIRMED'
  | 'CUSTOM';

// Phase 2 M6: QuestionCollector
export type QCCompletionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

// Phase 2 M7: ServiceCatalog
export type ServiceCatalogCategory =
  | 'COSMETIC_SURGERY' | 'DENTAL' | 'DERMATOLOGY' | 'ORTHOPEDIC'
  | 'CARDIAC' | 'OPHTHALMIC' | 'FERTILITY' | 'WEIGHT_LOSS'
  | 'HAIR_RESTORATION' | 'WELLNESS' | 'OTHER';

// Phase 2 M9: BookingRequest
export type BookingRequestStatus = 'PENDING' | 'HOSPITALS_MATCHED' | 'SELECTIONS_SAVED' | 'COMPLETED' | 'EXPIRED';
export type BookingConditionType = 'COSMETIC' | 'MEDICAL' | 'DENTAL' | 'WELLNESS' | 'OTHER';
export type ChatJourneyStage =
  | 'EXPLAIN_PROCESS'
  | 'COLLECT_MINIMAL_MEDICAL_FACTS'
  | 'COLLECT_MEDICAL_INPUTS'
  | 'RECOMMENDATION'
  | 'ONLINE_CONSULT'
  | 'HUMAN_HANDOFF';
export type ChatJourneyPhase = 'active' | 'pre' | 'post';
export type ChatResourceStatus = 'available' | 'submitted' | 'failed';
export type ChatResourceType =
  | 'PROCESS_GUIDE'
  | 'MEDICAL_DOC_UPLOAD'
  | 'QUESTIONNAIRE'
  | 'HOSPITAL_RECOMMENDATION'
  | 'PACKAGE_RECOMMENDATION'
  | 'ONLINE_CONSULT_BOOKING'
  | 'HUMAN_HANDOFF'
  | 'MEDICAL_INVITATION_STATUS';

// Unified AI Translation System
export type { TranslationTaskStatus, SourceDb, SupportedLanguage } from './translation.js';
export { TRANSLATION_CONFIG } from './translation.config.js';
