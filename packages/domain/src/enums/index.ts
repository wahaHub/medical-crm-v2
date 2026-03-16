export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
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
export type CaseTreatmentStage = 'CONFIRMED' | 'IN_TREATMENT' | 'POST_TREATMENT' | 'COMPLETED' | 'FOLLOW_UP';
export type AISummaryStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Phase 2 M1: CHC + Quotes
export type CHCSubStatus = 'DISTRIBUTED' | 'NEED_INFO' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REMOVED';
export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

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
  | 'AI_SUMMARY_GENERATED';

export type ActorType = 'PATIENT' | 'HOSPITAL' | 'ADMIN' | 'SYSTEM';

// Phase 2 M3: Support Tickets
export type TicketType = 'ACCOUNT_ISSUES' | 'PAYMENT_PROBLEMS' | 'HOSPITAL_COMMUNICATION' | 'DOCUMENT_HELP' | 'VISA_TRAVEL' | 'GENERAL_QUESTIONS' | 'FEEDBACK';
export type TicketPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'PENDING_INFO' | 'RESOLVED' | 'CLOSED';
export type TicketReplyRole = 'ADMIN' | 'PATIENT';

// Phase 2 M4: Orders + Packages
export type PackageType = 'TREATMENT' | 'CONSULTATION' | 'BUNDLE' | 'ADD_ON';
export type PackageStatus = 'DRAFT' | 'PUBLISHED';
export type OrderType = 'PACKAGE' | 'CONSULTATION' | 'CUSTOM';
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
