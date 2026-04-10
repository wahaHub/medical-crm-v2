// Types
export type { Actor, Session } from './types/actor.js';
export { toActor } from './types/actor.js';

// Services
export { TranslationTaskService } from './services/translation-task.service.js';
export {
  AiSyncTaskService,
  buildFaqEntityKey,
  buildPackageEntityKey,
  renderFaqSyncDocument,
  renderPackageSyncDocument,
} from './services/ai-sync-task.service.js';
export { ContextBuilderService } from './services/policy-engine/context-builder.service.js';
export { RiskResolverService } from './services/policy-engine/risk-resolver.service.js';
export { ActionPlannerService } from './services/policy-engine/action-planner.service.js';
export { RecommendationPolicyService } from './services/policy-engine/recommendation-policy.service.js';
export { HandoffPolicyService } from './services/policy-engine/handoff-policy.service.js';
export { WritebackPlannerService } from './services/policy-engine/writeback-planner.service.js';
export { WritebackExecutorService } from './services/policy-engine/writeback-executor.service.js';
export { JourneyEngineService } from './services/chatbot-v2/journey-engine.service.js';
export { ResourceRegistryService } from './services/chatbot-v2/resource-registry.service.js';
export { RequestClassifierService } from './services/chatbot-v2/request-classifier.service.js';
export { ConversationOrchestratorService } from './services/chatbot-v2/conversation-orchestrator.service.js';
export type {
  JourneySnapshot as ChatbotV2JourneySnapshot,
  JourneyTruth as ChatbotV2JourneyTruth,
  ChatbotV2RequestClass,
  ChatbotV2ResourceDescriptor,
  ChatbotV2FoundationState,
  RequestClassificationInput as ChatbotV2RequestClassificationInput,
  RequestClassificationResult as ChatbotV2RequestClassificationResult,
  ConversationOrchestrationResult as ChatbotV2ConversationOrchestrationResult,
} from './services/chatbot-v2/types.js';

// DTOs
export type { CaseDTO, HospitalCaseDetailDTO, CaseStatsDTO } from './dtos/case.dto.js';
export type { DocumentDTO, DocumentWithUrlDTO } from './dtos/document.dto.js';
export type {
  CaseProgressDTO, DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO,
} from './dtos/progress.dto.js';
export type { HospitalDTO } from './dtos/hospital.dto.js';
export {
  AI_POLICY_BACKEND_NEXT_ACTIONS,
  AI_POLICY_RESOLVED_INTENTS,
  AI_POLICY_ENGAGEMENT_SIGNALS,
  AI_POLICY_PROGRESSION_SIGNALS,
  AI_POLICY_RECOMMENDATION_SIGNALS,
} from './dtos/ai-policy.dto.js';
export type {
  AiPolicyRequestEnvelope,
  AiPolicyErrorEnvelope,
  AiPolicyEngagementMode,
  AiPolicyResolvedIntent,
  AiPolicyEngagementSignal,
  AiPolicyProgressionSignal,
  AiPolicyRecommendationSignal,
  AiPolicySemanticSignals,
} from './dtos/ai-policy.dto.js';
export type { ConversationDTO, MessageDTO } from './dtos/conversation.dto.js';
export type { ConsultationDTO, ConsultationTranscriptDTO } from './dtos/consultation.dto.js';
export type { CaseHospitalContactDTO } from './dtos/case-hospital-contact.dto.js';
export type { QuoteDTO } from './dtos/quote.dto.js';
export type { CaseEventDTO, TimelineItemDTO } from './dtos/case-event.dto.js';

// Mappers
export { toCaseDTO, toHospitalCaseDetailDTO } from './mappers/case.mapper.js';
export type { PatientInfo } from './mappers/case.mapper.js';
export { toDocumentDTO } from './mappers/document.mapper.js';
export { toProgressDTO, splitProgressByType } from './mappers/progress.mapper.js';
export { toHospitalDTO } from './mappers/hospital.mapper.js';
export { toConversationDTO, toMessageDTO } from './mappers/conversation.mapper.js';
export { toConsultationDTO, toConsultationTranscriptDTO } from './mappers/consultation.mapper.js';
export { toCaseHospitalContactDTO } from './mappers/case-hospital-contact.mapper.js';
export { toQuoteDTO } from './mappers/quote.mapper.js';
export { toCaseEventDTO, eventToTimelineItem } from './mappers/case-event.mapper.js';

// Use Cases — Cases
export { CreateCaseUseCase } from './use-cases/cases/create-case.use-case.js';
export type { CreateCaseInput } from './use-cases/cases/create-case.use-case.js';
export { ListCasesUseCase } from './use-cases/cases/list-cases.use-case.js';
export { GetCaseUseCase } from './use-cases/cases/get-case.use-case.js';
export { GetHospitalCaseDetailUseCase } from './use-cases/cases/get-hospital-case-detail.use-case.js';
export { UpdateCaseUseCase } from './use-cases/cases/update-case.use-case.js';
export type { UpdateCaseInput } from './use-cases/cases/update-case.use-case.js';
export { AssignCaseUseCase } from './use-cases/cases/assign-case.use-case.js';
export { UpdateCaseStatusUseCase } from './use-cases/cases/update-case-status.use-case.js';
export { AdvanceCaseStageUseCase } from './use-cases/cases/advance-case-stage.use-case.js';
export { GetCaseStatsUseCase } from './use-cases/cases/get-case-stats.use-case.js';

// Use Cases — Documents
export { UploadDocumentUseCase } from './use-cases/documents/upload-document.use-case.js';
export type { UploadDocumentInput } from './use-cases/documents/upload-document.use-case.js';
export { ListDocumentsUseCase } from './use-cases/documents/list-documents.use-case.js';
export { DeleteDocumentUseCase } from './use-cases/documents/delete-document.use-case.js';

// Use Cases — Progress
export { GetCaseProgressUseCase } from './use-cases/progress/get-case-progress.use-case.js';
export { AddCaseProgressUseCase } from './use-cases/progress/add-case-progress.use-case.js';
export type { AddProgressInput } from './use-cases/progress/add-case-progress.use-case.js';

// Use Cases — Hospitals
export { CreateHospitalUseCase } from './use-cases/hospitals/create-hospital.use-case.js';
export type { CreateHospitalInput } from './use-cases/hospitals/create-hospital.use-case.js';
export { ListHospitalsUseCase } from './use-cases/hospitals/list-hospitals.use-case.js';
export { GetHospitalUseCase } from './use-cases/hospitals/get-hospital.use-case.js';
export { UpdateHospitalUseCase } from './use-cases/hospitals/update-hospital.use-case.js';
export type { UpdateHospitalInput } from './use-cases/hospitals/update-hospital.use-case.js';
export { UpdateHospitalStatusUseCase } from './use-cases/hospitals/update-hospital-status.use-case.js';
export type { UpdateHospitalStatusInput } from './use-cases/hospitals/update-hospital-status.use-case.js';
export { GetHospitalCasesUseCase } from './use-cases/hospitals/get-hospital-cases.use-case.js';
export { GenerateRegistrationTokenUseCase } from './use-cases/hospitals/generate-registration-token.use-case.js';
export { RegisterHospitalUserUseCase } from './use-cases/hospitals/register-hospital-user.use-case.js';
export type { RegisterHospitalUserInput } from './use-cases/hospitals/register-hospital-user.use-case.js';
export { ValidateRegistrationTokenUseCase } from './use-cases/hospitals/validate-registration-token.use-case.js';
export type { TokenValidationResult } from './use-cases/hospitals/validate-registration-token.use-case.js';

// Use Cases — Conversations
export { CreateConversationUseCase } from './use-cases/conversations/create-conversation.use-case.js';
export type { CreateConversationInput } from './use-cases/conversations/create-conversation.use-case.js';
export { ListConversationsUseCase } from './use-cases/conversations/list-conversations.use-case.js';
export { GetConversationUseCase } from './use-cases/conversations/get-conversation.use-case.js';
export { UpdateConversationUseCase } from './use-cases/conversations/update-conversation.use-case.js';
export type { UpdateConversationInput } from './use-cases/conversations/update-conversation.use-case.js';

// Use Cases — Messages
export { SendMessageUseCase } from './use-cases/messages/send-message.use-case.js';
export type { SendMessageInput } from './use-cases/messages/send-message.use-case.js';
export { ListMessagesUseCase } from './use-cases/messages/list-messages.use-case.js';
export { GetMessageUseCase } from './use-cases/messages/get-message.use-case.js';
export { UpdateMessageUseCase } from './use-cases/messages/update-message.use-case.js';
export type { UpdateMessageInput } from './use-cases/messages/update-message.use-case.js';
export { DeleteMessageUseCase } from './use-cases/messages/delete-message.use-case.js';
export { ListPendingReviewUseCase } from './use-cases/messages/list-pending-review.use-case.js';
export { ApproveMessageUseCase } from './use-cases/messages/approve-message.use-case.js';
export { RejectMessageUseCase } from './use-cases/messages/reject-message.use-case.js';
export { RegenerateSummaryUseCase } from './use-cases/messages/regenerate-summary.use-case.js';
export { RetranslateMessageUseCase } from './use-cases/messages/retranslate-message.use-case.js';
export { ProcessMessageTasksUseCase } from './use-cases/messages/process-message-tasks.use-case.js';
export type { ProcessMessageTasksResult } from './use-cases/messages/process-message-tasks.use-case.js';

// Use Cases — AI Sync
export { BootstrapAiSyncUseCase } from './use-cases/ai-sync/bootstrap-ai-sync.use-case.js';
export type { BootstrapAiSyncResult } from './use-cases/ai-sync/bootstrap-ai-sync.use-case.js';
export { ProcessAiSyncOutboxUseCase } from './use-cases/ai-sync/process-ai-sync-outbox.use-case.js';
export type {
  ProcessAiSyncOutboxResult,
  AiSyncDocumentGateway,
} from './use-cases/ai-sync/process-ai-sync-outbox.use-case.js';

// Use Cases — Consultations
export { CreateConsultationUseCase } from './use-cases/consultations/create-consultation.use-case.js';
export type { CreateConsultationInput } from './use-cases/consultations/create-consultation.use-case.js';
export { GetConsultationUseCase } from './use-cases/consultations/get-consultation.use-case.js';
export { ListConsultationsUseCase } from './use-cases/consultations/list-consultations.use-case.js';
export { UpdateConsultationUseCase } from './use-cases/consultations/update-consultation.use-case.js';
export type { UpdateConsultationInput } from './use-cases/consultations/update-consultation.use-case.js';
export { UpdateConsultationStatusUseCase } from './use-cases/consultations/update-consultation-status.use-case.js';
export { GetConsultationTranscriptUseCase } from './use-cases/consultations/get-consultation-transcript.use-case.js';
export { GetConsultationStatsUseCase } from './use-cases/consultations/get-consultation-stats.use-case.js';
export { ListCaseConsultationsUseCase } from './use-cases/consultations/list-case-consultations.use-case.js';

// Use Cases — Materials
export { GetHospitalInfoUseCase } from './use-cases/materials/get-hospital-info.use-case.js';
export { GetProceduresUseCase } from './use-cases/materials/get-procedures.use-case.js';
export { GetSurgeonsUseCase } from './use-cases/materials/get-surgeons.use-case.js';
export { GetBeforeAfterCasesUseCase } from './use-cases/materials/get-before-after-cases.use-case.js';
export { UpdateHospitalInfoUseCase } from './use-cases/materials/update-hospital-info.use-case.js';
export type { UpdateHospitalInfoInput } from './use-cases/materials/update-hospital-info.use-case.js';
export { CreateProcedureUseCase } from './use-cases/materials/create-procedure.use-case.js';
export type { CreateProcedureInput } from './use-cases/materials/create-procedure.use-case.js';
export { UpdateProcedureUseCase } from './use-cases/materials/update-procedure.use-case.js';
export type { UpdateProcedureInput } from './use-cases/materials/update-procedure.use-case.js';
export { DeleteProcedureUseCase } from './use-cases/materials/delete-procedure.use-case.js';
export { CreateSurgeonUseCase } from './use-cases/materials/create-surgeon.use-case.js';
export type { CreateSurgeonInput } from './use-cases/materials/create-surgeon.use-case.js';
export { UpdateSurgeonUseCase } from './use-cases/materials/update-surgeon.use-case.js';
export type { UpdateSurgeonInput } from './use-cases/materials/update-surgeon.use-case.js';
export { DeleteSurgeonUseCase } from './use-cases/materials/delete-surgeon.use-case.js';
export { CreateBeforeAfterCaseUseCase } from './use-cases/materials/create-before-after-case.use-case.js';
export type { CreateBeforeAfterCaseInput } from './use-cases/materials/create-before-after-case.use-case.js';
export { UpdateBeforeAfterCaseUseCase } from './use-cases/materials/update-before-after-case.use-case.js';
export type { UpdateBeforeAfterCaseInput } from './use-cases/materials/update-before-after-case.use-case.js';
export { DeleteBeforeAfterCaseUseCase } from './use-cases/materials/delete-before-after-case.use-case.js';

// Use Cases — Quotes / CHC
export { AddHospitalToCaseUseCase } from './use-cases/quotes/add-hospital-to-case.use-case.js';
export { RemoveHospitalFromCaseUseCase } from './use-cases/quotes/remove-hospital-from-case.use-case.js';
export { SendReminderUseCase } from './use-cases/quotes/send-reminder.use-case.js';
export { ListCaseHospitalContactsUseCase } from './use-cases/quotes/list-case-hospital-contacts.use-case.js';
export { CreateQuoteUseCase } from './use-cases/quotes/create-quote.use-case.js';
export type { CreateQuoteInput } from './use-cases/quotes/create-quote.use-case.js';
export { UpdateQuoteUseCase } from './use-cases/quotes/update-quote.use-case.js';
export type { UpdateQuoteInput } from './use-cases/quotes/update-quote.use-case.js';
export { SendQuoteUseCase } from './use-cases/quotes/send-quote.use-case.js';
export { ListQuotesUseCase } from './use-cases/quotes/list-quotes.use-case.js';
export { GetQuoteUseCase } from './use-cases/quotes/get-quote.use-case.js';
export { CompareQuotesUseCase } from './use-cases/quotes/compare-quotes.use-case.js';
export { ResendQuoteUseCase } from './use-cases/quotes/resend-quote.use-case.js';
export { AcceptQuoteUseCase } from './use-cases/quotes/accept-quote.use-case.js';
export { RejectQuoteUseCase } from './use-cases/quotes/reject-quote.use-case.js';
export { AdminResetAssignmentUseCase } from './use-cases/quotes/admin-reset-assignment.use-case.js';

// Use Cases — Events / Timeline
export { RecordCaseEventUseCase } from './use-cases/events/record-case-event.use-case.js';
export type { RecordCaseEventInput } from './use-cases/events/record-case-event.use-case.js';
export { ListCaseEventsUseCase } from './use-cases/events/list-case-events.use-case.js';
export { GetCaseTimelineUseCase } from './use-cases/events/get-case-timeline.use-case.js';
export { GetAiPolicyContextUseCase } from './use-cases/ai-policy/get-ai-policy-context.use-case.js';
export { DecideAiPolicyUseCase } from './use-cases/ai-policy/decide-ai-policy.use-case.js';
export { ApplyAiPolicyWritebackUseCase } from './use-cases/ai-policy/apply-ai-policy-writeback.use-case.js';

// DTOs — Support Tickets
export type { SupportTicketDTO, SupportTicketReplyDTO } from './dtos/support-ticket.dto.js';

// Mappers — Support Tickets
export { toSupportTicketDTO, toSupportTicketReplyDTO } from './mappers/support-ticket.mapper.js';

// Use Cases — Support Tickets
export { CreateTicketUseCase } from './use-cases/tickets/create-ticket.use-case.js';
export type { CreateTicketInput } from './use-cases/tickets/create-ticket.use-case.js';
export { ListTicketsUseCase } from './use-cases/tickets/list-tickets.use-case.js';
export { GetTicketUseCase } from './use-cases/tickets/get-ticket.use-case.js';
export { AssignTicketUseCase } from './use-cases/tickets/assign-ticket.use-case.js';
export { ReplyToTicketUseCase } from './use-cases/tickets/reply-to-ticket.use-case.js';
export type { ReplyToTicketInput } from './use-cases/tickets/reply-to-ticket.use-case.js';
export { UpdateTicketStatusUseCase } from './use-cases/tickets/update-ticket-status.use-case.js';
export { CloseTicketUseCase } from './use-cases/tickets/close-ticket.use-case.js';

// DTOs — Packages + Orders
export type { PackageDTO } from './dtos/package.dto.js';
export type { OrderDTO } from './dtos/order.dto.js';

// Mappers — Packages + Orders
export { toPackageDTO } from './mappers/package.mapper.js';
export { toOrderDTO } from './mappers/order.mapper.js';

// Use Cases — Packages
export { CreatePackageUseCase } from './use-cases/packages/create-package.use-case.js';
export type { CreatePackageInput } from './use-cases/packages/create-package.use-case.js';
export { UpdatePackageUseCase } from './use-cases/packages/update-package.use-case.js';
export type { UpdatePackageInput } from './use-cases/packages/update-package.use-case.js';
export { DeletePackageUseCase } from './use-cases/packages/delete-package.use-case.js';
export { PublishPackageUseCase } from './use-cases/packages/publish-package.use-case.js';
export { UnpublishPackageUseCase } from './use-cases/packages/unpublish-package.use-case.js';
export { ListPackagesUseCase } from './use-cases/packages/list-packages.use-case.js';
export { GetPackageUseCase } from './use-cases/packages/get-package.use-case.js';

// Use Cases — Orders
export { CreateOrderUseCase } from './use-cases/orders/create-order.use-case.js';
export type { CreateOrderInput } from './use-cases/orders/create-order.use-case.js';
export { ListOrdersUseCase } from './use-cases/orders/list-orders.use-case.js';
export { GetOrderUseCase } from './use-cases/orders/get-order.use-case.js';
export { UpdateOrderStatusUseCase } from './use-cases/orders/update-order-status.use-case.js';
export { CreatePaymentIntentUseCase } from './use-cases/orders/create-payment-intent.use-case.js';
export type { PaymentIntentResult } from './use-cases/orders/create-payment-intent.use-case.js';
export { RequestRefundUseCase } from './use-cases/orders/request-refund.use-case.js';
export type { RequestRefundInput } from './use-cases/orders/request-refund.use-case.js';

// DTOs — Journey
export type { CaseJourneyDTO, JourneyMilestoneDTO } from './dtos/journey.dto.js';

// Mappers — Journey
export { toCaseJourneyDTO, toJourneyMilestoneDTO, milestoneToTimelineItem } from './mappers/journey.mapper.js';

// Use Cases — Journey
export { GetCaseJourneyUseCase } from './use-cases/journey/get-case-journey.use-case.js';
export { UpdateCaseJourneyUseCase } from './use-cases/journey/update-case-journey.use-case.js';
export type { UpdateJourneyInput } from './use-cases/journey/update-case-journey.use-case.js';
export { ListMilestonesUseCase } from './use-cases/journey/list-milestones.use-case.js';
export { CreateMilestoneUseCase } from './use-cases/journey/create-milestone.use-case.js';
export type { CreateMilestoneInput } from './use-cases/journey/create-milestone.use-case.js';
export { UpdateMilestoneUseCase } from './use-cases/journey/update-milestone.use-case.js';
export type { UpdateMilestoneInput } from './use-cases/journey/update-milestone.use-case.js';
export { DeleteMilestoneUseCase } from './use-cases/journey/delete-milestone.use-case.js';

// DTOs — QuestionCollector
export type { QCTemplateDTO, QCResponseDTO, QCCustomizationDTO } from './dtos/question-collector.dto.js';

// Mappers — QuestionCollector
export { toQCTemplateDTO, toQCResponseDTO, toQCCustomizationDTO } from './mappers/question-collector.mapper.js';

// Use Cases — QuestionCollector
export { CreateTemplateUseCase } from './use-cases/question-collector/create-template.use-case.js';
export type { CreateTemplateInput } from './use-cases/question-collector/create-template.use-case.js';
export { UpdateTemplateUseCase } from './use-cases/question-collector/update-template.use-case.js';
export type { UpdateTemplateInput } from './use-cases/question-collector/update-template.use-case.js';
export { DeleteTemplateUseCase } from './use-cases/question-collector/delete-template.use-case.js';
export { ListTemplatesUseCase } from './use-cases/question-collector/list-templates.use-case.js';
export { GetTemplateUseCase } from './use-cases/question-collector/get-template.use-case.js';
export type { GetTemplateResult } from './use-cases/question-collector/get-template.use-case.js';
export { SubmitResponseUseCase } from './use-cases/question-collector/submit-response.use-case.js';
export type { SubmitResponseInput } from './use-cases/question-collector/submit-response.use-case.js';
export { SaveResponseDraftUseCase } from './use-cases/question-collector/save-response-draft.use-case.js';
export type { SaveResponseDraftInput } from './use-cases/question-collector/save-response-draft.use-case.js';
export { GetResponseUseCase as GetQCResponseUseCase } from './use-cases/question-collector/get-response.use-case.js';
export { ListResponsesUseCase as ListQCResponsesUseCase } from './use-cases/question-collector/list-responses.use-case.js';
export { CustomizeQuestionsUseCase } from './use-cases/question-collector/customize-questions.use-case.js';
export type { CustomizeQuestionsInput } from './use-cases/question-collector/customize-questions.use-case.js';
export { GetCustomizationUseCase } from './use-cases/question-collector/get-customization.use-case.js';
export { GetTemplateByDiseaseUseCase } from './use-cases/question-collector/get-template-by-disease.use-case.js';
export type { GetTemplateByDiseaseResult, PatientSafeTemplateDTO, DiseaseSelector } from './use-cases/question-collector/get-template-by-disease.use-case.js';

// DTOs — ServiceCatalog
export type { ServiceCatalogItemDTO, QuoteTemplateDTO } from './dtos/service-catalog.dto.js';

// Mappers — ServiceCatalog
export { toServiceCatalogItemDTO, toQuoteTemplateDTO } from './mappers/service-catalog.mapper.js';

// Use Cases — ServiceCatalog Items
export { CreateServiceCatalogItemUseCase } from './use-cases/service-catalog/create-service-catalog-item.use-case.js';
export type { CreateServiceCatalogItemInput } from './use-cases/service-catalog/create-service-catalog-item.use-case.js';
export { ListServiceCatalogItemsUseCase } from './use-cases/service-catalog/list-service-catalog-items.use-case.js';
export { GetServiceCatalogItemUseCase } from './use-cases/service-catalog/get-service-catalog-item.use-case.js';
export { UpdateServiceCatalogItemUseCase } from './use-cases/service-catalog/update-service-catalog-item.use-case.js';
export type { UpdateServiceCatalogItemInput } from './use-cases/service-catalog/update-service-catalog-item.use-case.js';
export { DeleteServiceCatalogItemUseCase } from './use-cases/service-catalog/delete-service-catalog-item.use-case.js';
export { ListAllServiceCatalogItemsUseCase } from './use-cases/service-catalog/list-all-service-catalog-items.use-case.js';

// Use Cases — Quote Templates
export { CreateQuoteTemplateUseCase } from './use-cases/service-catalog/create-quote-template.use-case.js';
export type { CreateQuoteTemplateInput } from './use-cases/service-catalog/create-quote-template.use-case.js';
export { ListQuoteTemplatesUseCase as ListQuoteTemplatesUseCase } from './use-cases/service-catalog/list-quote-templates.use-case.js';
export { GetQuoteTemplateUseCase } from './use-cases/service-catalog/get-quote-template.use-case.js';
export { UpdateQuoteTemplateUseCase } from './use-cases/service-catalog/update-quote-template.use-case.js';
export type { UpdateQuoteTemplateInput } from './use-cases/service-catalog/update-quote-template.use-case.js';
export { DeleteQuoteTemplateUseCase } from './use-cases/service-catalog/delete-quote-template.use-case.js';

// DTOs — BookingRequest
export type { BookingRequestDTO, BookingRequestHospitalDTO } from './dtos/booking-request.dto.js';

// Mappers — BookingRequest
export { toBookingRequestDTO, toBookingRequestHospitalDTO } from './mappers/booking-request.mapper.js';

// Use Cases — BookingRequest
export { CreateBookingRequestUseCase } from './use-cases/booking/create-booking-request.use-case.js';
export type { CreateBookingRequestInput } from './use-cases/booking/create-booking-request.use-case.js';
export { GetHospitalRecommendationsUseCase } from './use-cases/booking/get-hospital-recommendations.use-case.js';
export type { GetHospitalRecommendationsResult } from './use-cases/booking/get-hospital-recommendations.use-case.js';
export { SaveHospitalSelectionsUseCase } from './use-cases/booking/save-hospital-selections.use-case.js';
export type { SaveHospitalSelectionsInput } from './use-cases/booking/save-hospital-selections.use-case.js';
export { CompleteSignupUseCase } from './use-cases/booking/complete-signup.use-case.js';
export type { CompleteSignupInput, CompleteSignupResult } from './use-cases/booking/complete-signup.use-case.js';

// Use Cases — Patient Onboarding
export { InitOnboardingUseCase } from './use-cases/patient-onboarding/init-onboarding.use-case.js';
export type { InitOnboardingInput, InitOnboardingOutput } from './use-cases/patient-onboarding/init-onboarding.use-case.js';
export { MatchHospitalsUseCase } from './use-cases/patient-onboarding/match-hospitals.use-case.js';
export type { MatchHospitalsInput as MatchHospitalsUseCaseInput } from './use-cases/patient-onboarding/match-hospitals.use-case.js';

// Use Cases — Patient Auth
export { SendMagicLinkUseCase } from './use-cases/patient-auth/send-magic-link.use-case.js';
export type { IMagicLinkEmailService } from './use-cases/patient-auth/send-magic-link.use-case.js';
export { SendPatientLoginLinkUseCase } from './use-cases/patient-auth/send-patient-login-link.use-case.js';
export { EmailRoleConflictError, PatientAlreadyExistsError } from './use-cases/patient-auth/patient-entry-auth.errors.js';
export {
  VerifyPatientEntryTokenUseCase,
  VerifyPatientEntryTokenAuthError,
} from './use-cases/patient-auth/verify-patient-entry-token.use-case.js';
export { VerifyMagicLinkUseCase, VerifyMagicLinkAuthError } from './use-cases/patient-auth/verify-magic-link.use-case.js';
export { LoginWithPasswordUseCase } from './use-cases/patient-auth/login-with-password.use-case.js';
export { RestoreGuestSessionUseCase, RestoreGuestSessionAuthError } from './use-cases/patient-auth/restore-guest-session.use-case.js';
export { GetPatientSessionStateUseCase } from './use-cases/patient-auth/get-patient-session-state.use-case.js';
export { SetPasswordUseCase } from './use-cases/patient-auth/set-password.use-case.js';

// DTOs — Dashboard
export type { PatientDashboardDTO, AdminDashboardDTO, HospitalDashboardDTO } from './dtos/dashboard.dto.js';

// Use Cases — Dashboard
export { PatientDashboardUseCase } from './use-cases/dashboard/patient-dashboard.use-case.js';
export { AdminDashboardUseCase } from './use-cases/dashboard/admin-dashboard.use-case.js';
export { HospitalDashboardUseCase } from './use-cases/dashboard/hospital-dashboard.use-case.js';

// Use Cases — Patient Dashboard
export { GetPatientCasesUseCase } from './use-cases/patient-dashboard/get-patient-cases.use-case.js';
export { GetPatientCaseDetailUseCase } from './use-cases/patient-dashboard/get-patient-case-detail.use-case.js';
export { GetPatientConversationsUseCase } from './use-cases/patient-dashboard/get-patient-conversations.use-case.js';
export { PatientAcceptQuoteUseCase } from './use-cases/patient-dashboard/patient-accept-quote.use-case.js';
export { PatientRejectQuoteUseCase } from './use-cases/patient-dashboard/patient-reject-quote.use-case.js';
export { SelectHospitalsUseCase } from './use-cases/patient-dashboard/select-hospitals.use-case.js';
export { SkipMedicalFormUseCase } from './use-cases/patient-dashboard/skip-medical-form.use-case.js';
export { SubmitPatientQCResponseUseCase } from './use-cases/patient-dashboard/submit-patient-qc-response.use-case.js';
export type { SubmitPatientQCResponseInput } from './use-cases/patient-dashboard/submit-patient-qc-response.use-case.js';
export { GetPatientQCResponseUseCase } from './use-cases/patient-dashboard/get-patient-qc-response.use-case.js';
export type { GetPatientQCResponseInput, PatientSafeQCResponseDTO } from './use-cases/patient-dashboard/get-patient-qc-response.use-case.js';

// Use Cases — Patient Intake
export { GetIntakeTemplateUseCase } from './use-cases/patient-intake/get-intake-template.use-case.js';
export type { IntakeTemplate, IntakeQuestion } from './use-cases/patient-intake/get-intake-template.use-case.js';
export { SubmitIntakeUseCase } from './use-cases/patient-intake/submit-intake.use-case.js';

// DTOs — Chatbot FAQ
export type { ChatbotFaqItemDTO, ChatbotFaqCategoryDTO } from './dtos/chatbot-faq.dto.js';

// Mappers — Chatbot FAQ
export { toChatbotFaqItemDTO } from './mappers/chatbot-faq.mapper.js';

// Use Cases — Chatbot FAQ
export { CreateFaqItemUseCase } from './use-cases/chatbot-faq/create-faq-item.use-case.js';
export type { CreateFaqItemInput } from './use-cases/chatbot-faq/create-faq-item.use-case.js';
export { ListFaqItemsUseCase } from './use-cases/chatbot-faq/list-faq-items.use-case.js';
export { GetFaqItemUseCase } from './use-cases/chatbot-faq/get-faq-item.use-case.js';
export { UpdateFaqItemUseCase } from './use-cases/chatbot-faq/update-faq-item.use-case.js';
export type { UpdateFaqItemInput } from './use-cases/chatbot-faq/update-faq-item.use-case.js';
export { DeleteFaqItemUseCase } from './use-cases/chatbot-faq/delete-faq-item.use-case.js';
export { ImportFaqSeedUseCase } from './use-cases/chatbot-faq/import-faq-seed.use-case.js';
export { EvaluateFaqRetrievalUseCase } from './use-cases/chatbot-faq/evaluate-faq-retrieval.use-case.js';
export { ListFaqCategoriesUseCase } from './use-cases/chatbot-faq/list-faq-categories.use-case.js';
export { ListFaqCategoriesForChatbotUseCase } from './use-cases/chatbot-faq/list-faq-categories-for-chatbot.use-case.js';
export { CreateFaqCategoryUseCase } from './use-cases/chatbot-faq/create-faq-category.use-case.js';
export type { CreateFaqCategoryInput } from './use-cases/chatbot-faq/create-faq-category.use-case.js';
export { DeleteFaqCategoryUseCase } from './use-cases/chatbot-faq/delete-faq-category.use-case.js';

// DTOs — Email Template
export type { EmailTemplateDTO } from './dtos/email-template.dto.js';

// Mappers — Email Template
export { toEmailTemplateDTO } from './mappers/email-template.mapper.js';

// Use Cases — Email Templates
export { CreateEmailTemplateUseCase } from './use-cases/email-templates/create-email-template.use-case.js';
export type { CreateEmailTemplateInput } from './use-cases/email-templates/create-email-template.use-case.js';
export { ListEmailTemplatesUseCase } from './use-cases/email-templates/list-email-templates.use-case.js';
export type { EmailTemplateListQueryInput } from './use-cases/email-templates/list-email-templates.use-case.js';
export { GetEmailTemplateUseCase } from './use-cases/email-templates/get-email-template.use-case.js';
export { UpdateEmailTemplateUseCase } from './use-cases/email-templates/update-email-template.use-case.js';
export type { UpdateEmailTemplateInput } from './use-cases/email-templates/update-email-template.use-case.js';
export { DeleteEmailTemplateUseCase } from './use-cases/email-templates/delete-email-template.use-case.js';

// Use Cases — User Settings
export { GetProfileUseCase } from './use-cases/users/get-profile.use-case.js';
export { UpdateProfileUseCase } from './use-cases/users/update-profile.use-case.js';
export type { UpdateProfileInput } from './use-cases/users/update-profile.use-case.js';
export { ChangePasswordUseCase } from './use-cases/users/change-password.use-case.js';
export type { ChangePasswordInput } from './use-cases/users/change-password.use-case.js';

// Use Cases — Translations
export { ProcessTranslationTasksUseCase } from './use-cases/translations/process-translation-tasks.use-case.js';
export type { TranslationWriteback, ProcessTranslationTasksResult } from './use-cases/translations/process-translation-tasks.use-case.js';
export { RetryTranslationUseCase } from './use-cases/translations/retry-translation.use-case.js';
export type { RetryTranslationInput } from './use-cases/translations/retry-translation.use-case.js';
export { GetTranslationStatusUseCase } from './use-cases/translations/get-translation-status.use-case.js';
export type { TranslationStatusResult } from './use-cases/translations/get-translation-status.use-case.js';
