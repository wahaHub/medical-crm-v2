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
export type { IHospitalRepository, HospitalInfo, MatchedHospital, FindMatchingHospitalsInput } from './ports/hospital-repository.port.js';
export type { IPatientRepository, PatientBasicInfo } from './ports/patient-repository.port.js';
export type { IStorageService, PresignedUploadResult } from './ports/storage-service.port.js';

// Phase 2BC Ports — Hospital
export type { IHospitalManagementRepository, HospitalListQuery } from './ports/hospital-management-repository.port.js';
export type { IRegistrationTokenRepository } from './ports/registration-token-repository.port.js';
export type { IHospitalSyncService } from './ports/hospital-sync-service.port.js';
export type { IKeycloakAdminService, KeycloakUser } from './ports/keycloak-admin-service.port.js';
export type { IUserRepository, CreateUserInput } from './ports/user-repository.port.js';
export type { IEmailService } from './ports/email-service.port.js';

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

// Phase 2 M1: CHC + Quote Enums
export type { CHCSubStatus, QuoteStatus } from './enums/index.js';

// Phase 2 M2: Events / Timeline Enums
export type { CaseEventType, ActorType } from './enums/index.js';

// Phase 2 M1: State machines
export { CHC_SUB_STATUS_TRANSITIONS } from './state-machine/chc-sub-status-transitions.js';
export { QUOTE_STATUS_TRANSITIONS } from './state-machine/quote-status-transitions.js';

// Phase 2 M1: Value objects
export { QuoteNumber } from './value-objects/quote-number.js';

// Phase 2 M1: Entities
export { CaseHospitalContact } from './entities/case-hospital-contact.entity.js';
export type { CaseHospitalContactProps } from './entities/case-hospital-contact.entity.js';
export { Quote } from './entities/quote.entity.js';
export type { QuoteProps } from './entities/quote.entity.js';

// Phase 2 M1: Ports
export type { ICHCRepository, CHCListQuery } from './ports/case-hospital-contact-repository.port.js';
export type { IQuoteRepository, QuoteListQuery } from './ports/quote-repository.port.js';

// Phase 2 M2: Entities
export { CaseEvent } from './entities/case-event.entity.js';
export type { CaseEventProps } from './entities/case-event.entity.js';

// Phase 2 M2: Ports
export type { ICaseEventRepository, CaseEventListOptions } from './ports/case-event-repository.port.js';

// Phase 2 M3: Support Ticket Enums
export type {
  TicketType, TicketPriority, TicketStatus, TicketReplyRole,
} from './enums/index.js';

// Phase 2 M3: State machines
export { TICKET_STATUS_TRANSITIONS } from './state-machine/ticket-status-transitions.js';

// Phase 2 M3: Value objects
export { TicketNumber } from './value-objects/ticket-number.js';

// Phase 2 M3: Entities
export { SupportTicket } from './entities/support-ticket.entity.js';
export type { SupportTicketProps } from './entities/support-ticket.entity.js';
export { SupportTicketReply } from './entities/support-ticket-reply.entity.js';
export type { SupportTicketReplyProps } from './entities/support-ticket-reply.entity.js';

// Phase 2 M3: Ports
export type { ISupportTicketRepository, TicketListQuery } from './ports/support-ticket-repository.port.js';
export type { ISupportTicketReplyRepository } from './ports/support-ticket-reply-repository.port.js';

// Phase 2 M4: Orders + Packages Enums
export type { PackageType, PackageStatus, OrderType, OrderStatus } from './enums/index.js';

// Phase 2 M4: State machines
export { PACKAGE_STATUS_TRANSITIONS } from './state-machine/package-status-transitions.js';
export { ORDER_STATUS_TRANSITIONS } from './state-machine/order-status-transitions.js';

// Phase 2 M4: Value objects
export { OrderNumber } from './value-objects/order-number.js';

// Phase 2 M4: Entities
export { Package } from './entities/package.entity.js';
export type { PackageProps } from './entities/package.entity.js';
export { Order } from './entities/order.entity.js';
export type { OrderProps } from './entities/order.entity.js';

// Phase 2 M4: Ports
export type { IPackageRepository, PackageListQuery } from './ports/package-repository.port.js';
export type { IOrderRepository, OrderListQuery } from './ports/order-repository.port.js';

// Phase 2 M5: Journey Enums
export type { MilestoneEventType } from './enums/index.js';

// Phase 2 M5: Entities
export { CaseJourney } from './entities/case-journey.entity.js';
export type { CaseJourneyProps } from './entities/case-journey.entity.js';
export { JourneyMilestone } from './entities/journey-milestone.entity.js';
export type { JourneyMilestoneProps } from './entities/journey-milestone.entity.js';

// Phase 2 M5: Ports
export type { IJourneyRepository } from './ports/journey-repository.port.js';

// Phase 2 M6: QuestionCollector Enums
export type { QCCompletionStatus } from './enums/index.js';

// Phase 2 M6: QuestionCollector Entities
export { QCTemplate } from './entities/qc-template.entity.js';
export type { QCTemplateProps } from './entities/qc-template.entity.js';
export { QCResponse } from './entities/qc-response.entity.js';
export type { QCResponseProps } from './entities/qc-response.entity.js';
export { QCCustomization } from './entities/qc-customization.entity.js';
export type { QCCustomizationProps } from './entities/qc-customization.entity.js';

// Phase 2 M6: QuestionCollector Ports
export type {
  IQuestionCollectorRepository,
  QCTemplateListQuery,
  QCResponseListQuery,
} from './ports/question-collector-repository.port.js';

// Phase 2 M7: ServiceCatalog Enums
export type { ServiceCatalogCategory } from './enums/index.js';

// Phase 2 M7: ServiceCatalog Entities
export { ServiceCatalogItem } from './entities/service-catalog-item.entity.js';
export type { ServiceCatalogItemProps } from './entities/service-catalog-item.entity.js';
export { QuoteTemplate } from './entities/quote-template.entity.js';
export type { QuoteTemplateProps } from './entities/quote-template.entity.js';

// Phase 2 M7: ServiceCatalog Ports
export type {
  IServiceCatalogRepository,
  ServiceCatalogListQuery,
  QuoteTemplateListQuery,
} from './ports/service-catalog-repository.port.js';

// Phase 2 M9: BookingRequest Enums
export type { BookingRequestStatus, BookingConditionType } from './enums/index.js';

// Phase 2 M9: BookingRequest Value objects
export { BookingRequestNumber } from './value-objects/booking-request-number.js';

// Phase 2 M9: BookingRequest Entities
export { BookingRequest } from './entities/booking-request.entity.js';
export type { BookingRequestProps } from './entities/booking-request.entity.js';
export { BOOKING_STATUS_TRANSITIONS } from './entities/booking-request.entity.js';
export { BookingRequestHospital } from './entities/booking-request-hospital.entity.js';
export type { BookingRequestHospitalProps } from './entities/booking-request-hospital.entity.js';

// Phase 2 M9: BookingRequest Ports
export type { IBookingRequestRepository } from './ports/booking-request-repository.port.js';

// Phase CDE: Chatbot FAQ Entities
export { ChatbotFaqItem } from './entities/chatbot-faq-item.entity.js';
export type { ChatbotFaqItemProps } from './entities/chatbot-faq-item.entity.js';

// Phase CDE: Chatbot FAQ Ports
export type { IChatbotFaqRepository, ChatbotFaqListQuery } from './ports/chatbot-faq-repository.port.js';

// Services
export { CaseAssignmentService } from './services/case-assignment.service.js';
export { PatientAuthService } from './services/patient-auth.service.js';
export type { PatientSessionPayload, MagicLinkPayload } from './services/patient-auth.service.js';
