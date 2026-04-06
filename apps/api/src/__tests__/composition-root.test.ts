import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DifyApiClientService } from '@medical-crm/infrastructure/services';

vi.mock('@medical-crm/infrastructure/database', () => ({
  getCrmDb: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-main', () => ({
  getMainSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-china', () => ({
  getChinaSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/repositories', () => ({
  DrizzleCaseRepository: vi.fn(() => ({})),
  DrizzleDocumentRepository: vi.fn(() => ({})),
  DrizzleCaseProgressRepository: vi.fn(() => ({})),
  DrizzleHospitalRepository: vi.fn(() => ({})),
  DrizzlePatientRepository: vi.fn(() => ({})),
  DrizzleHospitalManagementRepository: vi.fn(() => ({})),
  DrizzleRegistrationTokenRepository: vi.fn(() => ({})),
  DrizzleUserRepository: vi.fn(() => ({})),
  DrizzleUserEmailLookupRepository: vi.fn(() => ({})),
  DrizzleConversationRepository: vi.fn(() => ({})),
  DrizzleMessageRepository: vi.fn(() => ({})),
  DrizzleMessageTaskRepository: vi.fn(() => ({})),
  DrizzleConsultationRepository: vi.fn(() => ({})),
  DrizzleConsultationTranscriptRepository: vi.fn(() => ({})),
  DrizzleCHCRepository: vi.fn(() => ({})),
  DrizzleQuoteRepository: vi.fn(() => ({})),
  DrizzleCaseEventRepository: vi.fn(() => ({})),
  DrizzleSupportTicketRepository: vi.fn(() => ({})),
  DrizzleSupportTicketReplyRepository: vi.fn(() => ({})),
  DrizzlePackageRepository: vi.fn(() => ({})),
  DrizzleOrderRepository: vi.fn(() => ({})),
  DrizzleJourneyRepository: vi.fn(() => ({})),
  DrizzleQuestionCollectorRepository: vi.fn(() => ({})),
  DrizzleServiceCatalogRepository: vi.fn(() => ({})),
  DrizzleBookingRequestRepository: vi.fn(() => ({})),
  DrizzleChatbotFaqRepository: vi.fn(() => ({})),
  DrizzleEmailTemplateRepository: vi.fn(() => ({})),
  DrizzleTransactionRunner: vi.fn(() => ({})),
  DrizzleTranslationTaskRepository: vi.fn(() => ({})),
  DrizzleAiChatSessionRepository: vi.fn(() => ({})),
  DrizzleAiChatMessageRepository: vi.fn(() => ({})),
  DrizzleAiUserProfileRepository: vi.fn(() => ({})),
  DrizzleAiChatTimelineEventRepository: vi.fn(() => ({})),
  DrizzleAiFollowupTriggerRepository: vi.fn(() => ({})),
  DrizzleAiHandoffRepository: vi.fn(() => ({})),
  DrizzleAiSyncOutboxRepository: vi.fn(() => ({})),
  DrizzleDifyDocumentMappingRepository: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/storage', () => ({
  SupabaseStorageAdapter: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/storage/r2', () => ({
  R2StorageAdapter: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/storage/s3', () => ({
  S3StorageAdapter: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/storage/registry', () => ({
  StorageAdapterRegistry: vi.fn(() => ({ get: vi.fn(() => ({})), resolveForDownload: vi.fn(() => ({})) })),
}));
vi.mock('@medical-crm/infrastructure/storage/routed', () => ({
  RoutedStorageService: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/application/services/media-upload', () => ({
  MediaUploadService: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/application/upload-policies', () => ({
  UploadPolicyRegistry: vi.fn(() => ({})),
  messageAttachmentPolicy: {},
  packageImagePolicy: {},
  caseDocumentPolicy: {},
  chatbotRequestDocsPolicy: {},
  ticketReplyAttachmentPolicy: {},
  faqAttachmentPolicy: {},
  consultationRecordingPolicy: {},
  emailTemplateAttachmentPolicy: {},
  materialsBeautyPolicies: [],
  materialsRegularPolicies: [],
}));
vi.mock('@medical-crm/infrastructure/supabase-main/materials', () => ({
  SupabaseMaterialsRepository: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/services', () => ({
  KeycloakAdminService: vi.fn(() => ({})),
  SupabaseHospitalSyncService: vi.fn(() => ({})),
  OpenAITranslationService: vi.fn(() => ({})),
  OpenAIBatchTranslationService: vi.fn(() => ({})),
  TranslationWritebackService: vi.fn(() => ({})),
  DifyApiClientService: vi.fn(() => ({})),
  RoutingMaterialsRepository: vi.fn(() => ({})),
  StubEmailService: vi.fn(() => ({})),
  ResendEmailService: { fromEnv: vi.fn(() => null) },
  SmtpEmailService: { fromEnv: vi.fn(() => null) },
}));
vi.mock('@medical-crm/infrastructure/supabase-china/materials', () => ({
  ChinaMedicalMaterialsRepository: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/database/idempotency', () => ({
  IdempotencyGuard: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/domain', () => ({
  CaseAssignmentService: vi.fn(() => ({})),
  PatientAuthService: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/application', () => ({
  CreateCaseUseCase: vi.fn(() => ({})),
  ListCasesUseCase: vi.fn(() => ({})),
  GetCaseUseCase: vi.fn(() => ({})),
  GetHospitalCaseDetailUseCase: vi.fn(() => ({})),
  UpdateCaseUseCase: vi.fn(() => ({})),
  AssignCaseUseCase: vi.fn(() => ({})),
  UpdateCaseStatusUseCase: vi.fn(() => ({})),
  AdvanceCaseStageUseCase: vi.fn(() => ({})),
  GetCaseStatsUseCase: vi.fn(() => ({})),
  UploadDocumentUseCase: vi.fn(() => ({})),
  ListDocumentsUseCase: vi.fn(() => ({})),
  DeleteDocumentUseCase: vi.fn(() => ({})),
  GetCaseProgressUseCase: vi.fn(() => ({})),
  AddCaseProgressUseCase: vi.fn(() => ({})),
  // Hospital
  CreateHospitalUseCase: vi.fn(() => ({})),
  ListHospitalsUseCase: vi.fn(() => ({})),
  GetHospitalUseCase: vi.fn(() => ({})),
  UpdateHospitalUseCase: vi.fn(() => ({})),
  UpdateHospitalStatusUseCase: vi.fn(() => ({})),
  GetHospitalCasesUseCase: vi.fn(() => ({})),
  GenerateRegistrationTokenUseCase: vi.fn(() => ({})),
  RegisterHospitalUserUseCase: vi.fn(() => ({})),
  // Conversations
  CreateConversationUseCase: vi.fn(() => ({})),
  ListConversationsUseCase: vi.fn(() => ({})),
  GetConversationUseCase: vi.fn(() => ({})),
  UpdateConversationUseCase: vi.fn(() => ({})),
  // Messages
  SendMessageUseCase: vi.fn(() => ({})),
  ListMessagesUseCase: vi.fn(() => ({})),
  GetMessageUseCase: vi.fn(() => ({})),
  UpdateMessageUseCase: vi.fn(() => ({})),
  DeleteMessageUseCase: vi.fn(() => ({})),
  ListPendingReviewUseCase: vi.fn(() => ({})),
  ApproveMessageUseCase: vi.fn(() => ({})),
  RejectMessageUseCase: vi.fn(() => ({})),
  RegenerateSummaryUseCase: vi.fn(() => ({})),
  RetranslateMessageUseCase: vi.fn(() => ({})),
  ProcessMessageTasksUseCase: vi.fn(() => ({})),
  ProcessTranslationTasksUseCase: vi.fn(() => ({})),
  RetryTranslationUseCase: vi.fn(() => ({})),
  GetTranslationStatusUseCase: vi.fn(() => ({})),
  ProcessAiSyncOutboxUseCase: vi.fn(() => ({})),
  BootstrapAiSyncUseCase: vi.fn(() => ({})),
  // Consultations
  CreateConsultationUseCase: vi.fn(() => ({})),
  GetConsultationUseCase: vi.fn(() => ({})),
  ListConsultationsUseCase: vi.fn(() => ({})),
  UpdateConsultationUseCase: vi.fn(() => ({})),
  UpdateConsultationStatusUseCase: vi.fn(() => ({})),
  GetConsultationTranscriptUseCase: vi.fn(() => ({})),
  GetConsultationStatsUseCase: vi.fn(() => ({})),
  ListCaseConsultationsUseCase: vi.fn(() => ({})),
  // Hospital Materials
  GetHospitalInfoUseCase: vi.fn(() => ({})),
  GetProceduresUseCase: vi.fn(() => ({})),
  GetSurgeonsUseCase: vi.fn(() => ({})),
  GetBeforeAfterCasesUseCase: vi.fn(() => ({})),
  UpdateHospitalInfoUseCase: vi.fn(() => ({})),
  CreateProcedureUseCase: vi.fn(() => ({})),
  UpdateProcedureUseCase: vi.fn(() => ({})),
  DeleteProcedureUseCase: vi.fn(() => ({})),
  CreateSurgeonUseCase: vi.fn(() => ({})),
  UpdateSurgeonUseCase: vi.fn(() => ({})),
  DeleteSurgeonUseCase: vi.fn(() => ({})),
  CreateBeforeAfterCaseUseCase: vi.fn(() => ({})),
  UpdateBeforeAfterCaseUseCase: vi.fn(() => ({})),
  DeleteBeforeAfterCaseUseCase: vi.fn(() => ({})),
  // CHC + Quotes
  AddHospitalToCaseUseCase: vi.fn(() => ({})),
  RemoveHospitalFromCaseUseCase: vi.fn(() => ({})),
  SendReminderUseCase: vi.fn(() => ({})),
  ListCaseHospitalContactsUseCase: vi.fn(() => ({})),
  CreateQuoteUseCase: vi.fn(() => ({})),
  UpdateQuoteUseCase: vi.fn(() => ({})),
  SendQuoteUseCase: vi.fn(() => ({})),
  ListQuotesUseCase: vi.fn(() => ({})),
  GetQuoteUseCase: vi.fn(() => ({})),
  CompareQuotesUseCase: vi.fn(() => ({})),
  ResendQuoteUseCase: vi.fn(() => ({})),
  AcceptQuoteUseCase: vi.fn(() => ({})),
  RejectQuoteUseCase: vi.fn(() => ({})),
  AdminResetAssignmentUseCase: vi.fn(() => ({})),
  // Events / Timeline
  RecordCaseEventUseCase: vi.fn(() => ({})),
  ListCaseEventsUseCase: vi.fn(() => ({})),
  GetCaseTimelineUseCase: vi.fn(() => ({})),
  // Support Tickets
  CreateTicketUseCase: vi.fn(() => ({})),
  ListTicketsUseCase: vi.fn(() => ({})),
  GetTicketUseCase: vi.fn(() => ({})),
  AssignTicketUseCase: vi.fn(() => ({})),
  ReplyToTicketUseCase: vi.fn(() => ({})),
  UpdateTicketStatusUseCase: vi.fn(() => ({})),
  CloseTicketUseCase: vi.fn(() => ({})),
  // Packages
  CreatePackageUseCase: vi.fn(() => ({})),
  UpdatePackageUseCase: vi.fn(() => ({})),
  DeletePackageUseCase: vi.fn(() => ({})),
  PublishPackageUseCase: vi.fn(() => ({})),
  UnpublishPackageUseCase: vi.fn(() => ({})),
  ListPackagesUseCase: vi.fn(() => ({})),
  GetPackageUseCase: vi.fn(() => ({})),
  // Orders
  CreateOrderUseCase: vi.fn(() => ({})),
  ListOrdersUseCase: vi.fn(() => ({})),
  GetOrderUseCase: vi.fn(() => ({})),
  UpdateOrderStatusUseCase: vi.fn(() => ({})),
  CreatePaymentIntentUseCase: vi.fn(() => ({})),
  RequestRefundUseCase: vi.fn(() => ({})),
  // Journey
  GetCaseJourneyUseCase: vi.fn(() => ({})),
  UpdateCaseJourneyUseCase: vi.fn(() => ({})),
  ListMilestonesUseCase: vi.fn(() => ({})),
  CreateMilestoneUseCase: vi.fn(() => ({})),
  UpdateMilestoneUseCase: vi.fn(() => ({})),
  DeleteMilestoneUseCase: vi.fn(() => ({})),
  // QuestionCollector
  CreateTemplateUseCase: vi.fn(() => ({})),
  UpdateTemplateUseCase: vi.fn(() => ({})),
  DeleteTemplateUseCase: vi.fn(() => ({})),
  ListTemplatesUseCase: vi.fn(() => ({})),
  GetTemplateUseCase: vi.fn(() => ({})),
  SubmitResponseUseCase: vi.fn(() => ({})),
  SaveResponseDraftUseCase: vi.fn(() => ({})),
  GetQCResponseUseCase: vi.fn(() => ({})),
  ListQCResponsesUseCase: vi.fn(() => ({})),
  CustomizeQuestionsUseCase: vi.fn(() => ({})),
  GetCustomizationUseCase: vi.fn(() => ({})),
  GetTemplateByDiseaseUseCase: vi.fn(() => ({})),
  // ServiceCatalog
  CreateServiceCatalogItemUseCase: vi.fn(() => ({})),
  ListServiceCatalogItemsUseCase: vi.fn(() => ({})),
  GetServiceCatalogItemUseCase: vi.fn(() => ({})),
  UpdateServiceCatalogItemUseCase: vi.fn(() => ({})),
  DeleteServiceCatalogItemUseCase: vi.fn(() => ({})),
  ListAllServiceCatalogItemsUseCase: vi.fn(() => ({})),
  // QuoteTemplates
  CreateQuoteTemplateUseCase: vi.fn(() => ({})),
  ListQuoteTemplatesUseCase: vi.fn(() => ({})),
  GetQuoteTemplateUseCase: vi.fn(() => ({})),
  UpdateQuoteTemplateUseCase: vi.fn(() => ({})),
  DeleteQuoteTemplateUseCase: vi.fn(() => ({})),
  // Dashboard
  PatientDashboardUseCase: vi.fn(() => ({})),
  AdminDashboardUseCase: vi.fn(() => ({})),
  HospitalDashboardUseCase: vi.fn(() => ({})),
  // Booking
  CreateBookingRequestUseCase: vi.fn(() => ({})),
  GetHospitalRecommendationsUseCase: vi.fn(() => ({})),
  SaveHospitalSelectionsUseCase: vi.fn(() => ({})),
  CompleteSignupUseCase: vi.fn(() => ({})),
  // Patient use cases
  ValidateRegistrationTokenUseCase: vi.fn(() => ({})),
  GetPatientCasesUseCase: vi.fn(() => ({})),
  GetPatientCaseDetailUseCase: vi.fn(() => ({})),
  GetPatientConversationsUseCase: vi.fn(() => ({})),
  PatientAcceptQuoteUseCase: vi.fn(() => ({})),
  PatientRejectQuoteUseCase: vi.fn(() => ({})),
  GetIntakeTemplateUseCase: vi.fn(() => ({})),
  SubmitIntakeUseCase: vi.fn(() => ({})),
  SelectHospitalsUseCase: vi.fn(() => ({})),
  SkipMedicalFormUseCase: vi.fn(() => ({})),
  SubmitPatientQCResponseUseCase: vi.fn(() => ({})),
  GetPatientQCResponseUseCase: vi.fn(() => ({})),
  InitOnboardingUseCase: vi.fn(() => ({})),
  MatchHospitalsUseCase: vi.fn(() => ({})),
  SendMagicLinkUseCase: vi.fn(() => ({})),
  SendPatientLoginLinkUseCase: vi.fn(() => ({})),
  VerifyPatientEntryTokenUseCase: vi.fn(() => ({})),
  VerifyMagicLinkUseCase: vi.fn(() => ({})),
  LoginWithPasswordUseCase: vi.fn(() => ({})),
  RestoreGuestSessionUseCase: vi.fn(() => ({})),
  GetPatientSessionStateUseCase: vi.fn(() => ({})),
  SetPasswordUseCase: vi.fn(() => ({})),
  // Chatbot FAQ
  CreateFaqItemUseCase: vi.fn(() => ({})),
  ListFaqItemsUseCase: vi.fn(() => ({})),
  ListFaqCategoriesUseCase: vi.fn(() => ({})),
  ListFaqCategoriesForChatbotUseCase: vi.fn(() => ({})),
  EvaluateFaqRetrievalUseCase: vi.fn(() => ({})),
  CreateFaqCategoryUseCase: vi.fn(() => ({})),
  DeleteFaqCategoryUseCase: vi.fn(() => ({})),
  GetFaqItemUseCase: vi.fn(() => ({})),
  UpdateFaqItemUseCase: vi.fn(() => ({})),
  DeleteFaqItemUseCase: vi.fn(() => ({})),
  // Email Templates
  CreateEmailTemplateUseCase: vi.fn(() => ({})),
  ListEmailTemplatesUseCase: vi.fn(() => ({})),
  GetEmailTemplateUseCase: vi.fn(() => ({})),
  UpdateEmailTemplateUseCase: vi.fn(() => ({})),
  DeleteEmailTemplateUseCase: vi.fn(() => ({})),
  // User settings
  GetProfileUseCase: vi.fn(() => ({})),
  UpdateProfileUseCase: vi.fn(() => ({})),
  ChangePasswordUseCase: vi.fn(() => ({})),
  TranslationTaskService: vi.fn(() => ({})),
  AiSyncTaskService: vi.fn(() => ({})),
  ContextBuilderService: vi.fn(() => ({})),
  RiskResolverService: vi.fn(() => ({})),
  ActionPlannerService: vi.fn(() => ({})),
  RecommendationPolicyService: vi.fn(() => ({})),
  HandoffPolicyService: vi.fn(() => ({})),
  WritebackPlannerService: vi.fn(() => ({})),
  WritebackExecutorService: vi.fn(() => ({})),
  GetAiPolicyContextUseCase: vi.fn(() => ({})),
  DecideAiPolicyUseCase: vi.fn(() => ({})),
  ApplyAiPolicyWritebackUseCase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/config', () => ({
  getServerEnv: vi.fn(() => ({
    DATABASE_URL: 'postgresql://localhost/test',
    MAIN_SUPABASE_URL: 'https://main.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'key',
    CHINA_MEDICAL_SUPABASE_URL: 'https://china.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'key',
  })),
}));

describe('composition root', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates services without throwing', async () => {
    const { getServices } = await import('../composition-root');
    expect(() => getServices()).not.toThrow();
  });

  it('returns all expected infrastructure clients', async () => {
    const { getServices } = await import('../composition-root');
    const services = getServices();
    expect(services).toHaveProperty('crmDb');
    expect(services).toHaveProperty('mainSupabase');
    expect(services).toHaveProperty('chinaSupabase');
  });

  it('returns all expected use cases', async () => {
    const { getServices } = await import('../composition-root');
    const services = getServices();

    // Phase 1 cases
    expect(services).toHaveProperty('createCase');
    expect(services).toHaveProperty('listCases');
    expect(services).toHaveProperty('getCaseStats');

    // Phase 2BC — hospitals
    expect(services).toHaveProperty('createHospital');
    expect(services).toHaveProperty('listHospitals');
    expect(services).toHaveProperty('getHospital');
    expect(services).toHaveProperty('updateHospital');
    expect(services).toHaveProperty('updateHospitalStatus');
    expect(services).toHaveProperty('getHospitalCases');
    expect(services).toHaveProperty('generateRegistrationToken');
    expect(services).toHaveProperty('registerHospitalUser');

    // Phase 2BC — conversations
    expect(services).toHaveProperty('createConversation');
    expect(services).toHaveProperty('listConversations');
    expect(services).toHaveProperty('getConversation');
    expect(services).toHaveProperty('updateConversation');

    // Phase 2BC — messages
    expect(services).toHaveProperty('sendMessage');
    expect(services).toHaveProperty('listMessages');
    expect(services).toHaveProperty('getMessage');
    expect(services).toHaveProperty('updateMessage');
    expect(services).toHaveProperty('deleteMessage');
    expect(services).toHaveProperty('listPendingReview');
    expect(services).toHaveProperty('approveMessage');
    expect(services).toHaveProperty('rejectMessage');
    expect(services).toHaveProperty('regenerateSummary');
    expect(services).toHaveProperty('retranslateMessage');
    expect(services).toHaveProperty('processMessageTasks');

    // Phase 2BC — consultations
    expect(services).toHaveProperty('createConsultation');
    expect(services).toHaveProperty('getConsultation');
    expect(services).toHaveProperty('listConsultations');
    expect(services).toHaveProperty('updateConsultation');
    expect(services).toHaveProperty('updateConsultationStatus');
    expect(services).toHaveProperty('getConsultationTranscript');
    expect(services).toHaveProperty('getConsultationStats');
    expect(services).toHaveProperty('listCaseConsultations');

    // Phase 3 — hospital materials
    expect(services).toHaveProperty('getHospitalInfo');
    expect(services).toHaveProperty('getProcedures');
    expect(services).toHaveProperty('getSurgeons');
    expect(services).toHaveProperty('getBeforeAfterCases');
    expect(services).toHaveProperty('updateHospitalInfo');
    expect(services).toHaveProperty('createProcedure');
    expect(services).toHaveProperty('updateProcedure');
    expect(services).toHaveProperty('deleteProcedure');
    expect(services).toHaveProperty('createSurgeon');
    expect(services).toHaveProperty('updateSurgeon');
    expect(services).toHaveProperty('deleteSurgeon');
    expect(services).toHaveProperty('createBeforeAfterCase');
    expect(services).toHaveProperty('updateBeforeAfterCase');
    expect(services).toHaveProperty('deleteBeforeAfterCase');

    // CHC
    expect(services).toHaveProperty('addHospitalToCase');
    expect(services).toHaveProperty('removeHospitalFromCase');
    expect(services).toHaveProperty('sendReminder');
    expect(services).toHaveProperty('listCaseHospitalContacts');

    // Quotes
    expect(services).toHaveProperty('createQuote');
    expect(services).toHaveProperty('updateQuote');
    expect(services).toHaveProperty('sendQuote');
    expect(services).toHaveProperty('listQuotes');
    expect(services).toHaveProperty('getQuote');
    expect(services).toHaveProperty('compareQuotes');
    expect(services).toHaveProperty('resendQuote');
    expect(services).toHaveProperty('acceptQuote');
    expect(services).toHaveProperty('rejectQuote');
    expect(services).toHaveProperty('adminResetAssignment');

    // Events / Timeline
    expect(services).toHaveProperty('recordCaseEvent');
    expect(services).toHaveProperty('listCaseEvents');
    expect(services).toHaveProperty('getCaseTimeline');

    // Support Tickets
    expect(services).toHaveProperty('createTicket');
    expect(services).toHaveProperty('listTickets');
    expect(services).toHaveProperty('getTicket');
    expect(services).toHaveProperty('assignTicket');
    expect(services).toHaveProperty('replyToTicket');
    expect(services).toHaveProperty('updateTicketStatus');
    expect(services).toHaveProperty('closeTicket');

    // Packages
    expect(services).toHaveProperty('createPackage');
    expect(services).toHaveProperty('updatePackage');
    expect(services).toHaveProperty('deletePackage');
    expect(services).toHaveProperty('publishPackage');
    expect(services).toHaveProperty('unpublishPackage');
    expect(services).toHaveProperty('listPackages');
    expect(services).toHaveProperty('getPackage');

    // Orders
    expect(services).toHaveProperty('createOrder');
    expect(services).toHaveProperty('listOrders');
    expect(services).toHaveProperty('getOrder');
    expect(services).toHaveProperty('updateOrderStatus');
    expect(services).toHaveProperty('createPaymentIntent');
    expect(services).toHaveProperty('requestRefund');

    // Journey
    expect(services).toHaveProperty('getCaseJourney');
    expect(services).toHaveProperty('updateCaseJourney');
    expect(services).toHaveProperty('listMilestones');
    expect(services).toHaveProperty('createMilestone');
    expect(services).toHaveProperty('updateMilestone');
    expect(services).toHaveProperty('deleteMilestone');

    // QuestionCollector
    expect(services).toHaveProperty('createTemplate');
    expect(services).toHaveProperty('updateTemplate');
    expect(services).toHaveProperty('deleteTemplate');
    expect(services).toHaveProperty('listTemplates');
    expect(services).toHaveProperty('getTemplate');
    expect(services).toHaveProperty('submitQCResponse');
    expect(services).toHaveProperty('saveQCResponseDraft');
    expect(services).toHaveProperty('getQCResponse');
    expect(services).toHaveProperty('listQCResponses');
    expect(services).toHaveProperty('customizeQuestions');
    expect(services).toHaveProperty('getCustomization');

    // Chatbot FAQ
    expect(services).toHaveProperty('createFaqItem');
    expect(services).toHaveProperty('listFaqItems');
    expect(services).toHaveProperty('listFaqCategories');
    expect(services).toHaveProperty('createFaqCategory');
    expect(services).toHaveProperty('deleteFaqCategory');
    expect(services).toHaveProperty('getFaqItem');
    expect(services).toHaveProperty('updateFaqItem');
    expect(services).toHaveProperty('deleteFaqItem');

    // ServiceCatalog
    expect(services).toHaveProperty('createServiceCatalogItem');
    expect(services).toHaveProperty('listServiceCatalogItems');
    expect(services).toHaveProperty('getServiceCatalogItem');
    expect(services).toHaveProperty('updateServiceCatalogItem');
    expect(services).toHaveProperty('deleteServiceCatalogItem');
    expect(services).toHaveProperty('listAllServiceCatalogItems');

    // QuoteTemplates
    expect(services).toHaveProperty('createQuoteTemplate');
    expect(services).toHaveProperty('listQuoteTemplates');
    expect(services).toHaveProperty('getQuoteTemplate');
    expect(services).toHaveProperty('updateQuoteTemplate');
    expect(services).toHaveProperty('deleteQuoteTemplate');

    // Dashboard
    expect(services).toHaveProperty('patientDashboard');
    expect(services).toHaveProperty('adminDashboard');
    expect(services).toHaveProperty('hospitalDashboard');

    // Booking
    expect(services).toHaveProperty('createBookingRequest');
    expect(services).toHaveProperty('getHospitalRecommendations');
    expect(services).toHaveProperty('saveHospitalSelections');
    expect(services).toHaveProperty('completeSignup');

    // Patient onboarding
    expect(services).toHaveProperty('initOnboarding');
    expect(services).toHaveProperty('matchHospitals');

    // Patient auth
    expect(services).toHaveProperty('patientAuthService');
    expect(services).toHaveProperty('sendMagicLink');
    expect(services).toHaveProperty('sendPatientLoginLink');
    expect(services).toHaveProperty('verifyMagicLink');
    expect(services).toHaveProperty('setPassword');

    // Patient dashboard / portal
    expect(services).toHaveProperty('getPatientCases');
    expect(services).toHaveProperty('getPatientCaseDetail');
    expect(services).toHaveProperty('getPatientConversations');
    expect(services).toHaveProperty('patientAcceptQuote');
    expect(services).toHaveProperty('patientRejectQuote');
    expect(services).toHaveProperty('getIntakeTemplate');
    expect(services).toHaveProperty('submitIntake');
    expect(services).toHaveProperty('selectHospitals');

    // Validate registration token
    expect(services).toHaveProperty('validateRegistrationToken');
  });

  it('configures Dify client with a 90s default timeout', async () => {
    const difyClientMock = vi.mocked(DifyApiClientService);
    delete process.env['DIFY_REQUEST_TIMEOUT_MS'];

    const { getServices } = await import('../composition-root');
    getServices();

    expect(difyClientMock).toHaveBeenCalledWith(
      'https://api.dify.ai/v1',
      '',
      90_000,
      null,
    );
  });
});
