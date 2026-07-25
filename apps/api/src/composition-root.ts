import { join } from 'node:path';
import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  IHospitalRepository,
  IPatientRepository,
  IUserEmailLookupRepository,
  INotificationRecipientRepository,
  IEmailNotificationCooldownRepository,
  IConversationRepository,
  IMessageRepository,
  ICHCRepository,
  IStorageService,
  IAiChatSessionRepository,
  IAiChatMessageRepository,
  IAiUserProfileRepository,
  IAiSyncOutboxRepository,
  IDifyDocumentMappingRepository,
} from '@medical-crm/domain';
import { CaseAssignmentService, PatientAuthService } from '@medical-crm/domain';
import {
  CreateCaseUseCase,
  ListCasesUseCase,
  GetCaseUseCase,
  GetHospitalCaseDetailUseCase,
  UpdateCaseUseCase,
  SaveCaseDiagnosisUseCase,
  AssignCaseUseCase,
  UpdateCaseStatusUseCase,
  AdvanceCaseStageUseCase,
  GetCaseStatsUseCase,
  UploadDocumentUseCase,
  ListDocumentsUseCase,
  GetDocumentPreviewUseCase,
  DeleteDocumentUseCase,
  GetCaseProgressUseCase,
  AddCaseProgressUseCase,
  CreateHospitalUseCase,
  ListHospitalsUseCase,
  PublicListHospitalsUseCase,
  PublicGetHospitalUseCase,
  GetHospitalUseCase,
  UpdateHospitalUseCase,
  UpdateHospitalStatusUseCase,
  GetHospitalCasesUseCase,
  GenerateRegistrationTokenUseCase,
  RegisterHospitalUserUseCase,
  ValidateRegistrationTokenUseCase,
  RequestHospitalPasswordResetUseCase,
  ValidateHospitalPasswordResetTokenUseCase,
  ResetHospitalPasswordUseCase,
  CreateConversationUseCase,
  ListConversationsUseCase,
  GetConversationUseCase,
  UpdateConversationUseCase,
  SendMessageUseCase,
  ListMessagesUseCase,
  GetMessageUseCase,
  UpdateMessageUseCase,
  DeleteMessageUseCase,
  ListPendingReviewUseCase,
  ApproveMessageUseCase,
  RejectMessageUseCase,
  RegenerateSummaryUseCase,
  RetranslateMessageUseCase,
  ProcessMessageTasksUseCase,
  BootstrapAiSyncUseCase,
  ProcessAiSyncOutboxUseCase,
  CreateConsultationUseCase,
  GetConsultationUseCase,
  ListConsultationsUseCase,
  UpdateConsultationUseCase,
  UpdateConsultationStatusUseCase,
  GetConsultationTranscriptUseCase,
  GetConsultationStatsUseCase,
  ListCaseConsultationsUseCase,
  GetHospitalInfoUseCase,
  GetProceduresUseCase,
  GetSurgeonsUseCase,
  GetBeforeAfterCasesUseCase,
  UpdateHospitalInfoUseCase,
  CreateProcedureUseCase,
  UpdateProcedureUseCase,
  DeleteProcedureUseCase,
  CreateSurgeonUseCase,
  UpdateSurgeonUseCase,
  DeleteSurgeonUseCase,
  CreateBeforeAfterCaseUseCase,
  UpdateBeforeAfterCaseUseCase,
  DeleteBeforeAfterCaseUseCase,
  GetMaterialsReviewsUseCase,
  CreateMaterialsReviewUseCase,
  UpdateMaterialsReviewUseCase,
  DeleteMaterialsReviewUseCase,
  GetMaterialsPackagesUseCase,
  GetMaterialsPackageUseCase,
  CreateMaterialsPackageUseCase,
  UpdateMaterialsPackageUseCase,
  DeleteMaterialsPackageUseCase,
  AddHospitalToCaseUseCase,
  RemoveHospitalFromCaseUseCase,
  SendReminderUseCase,
  ListCaseHospitalContactsUseCase,
  CreateQuoteUseCase,
  UpdateQuoteUseCase,
  SendQuoteUseCase,
  ListQuotesUseCase,
  GetQuoteUseCase,
  CompareQuotesUseCase,
  ResendQuoteUseCase,
  AcceptQuoteUseCase,
  RejectQuoteUseCase,
  AdminResetAssignmentUseCase,
  RecordCaseEventUseCase,
  ListCaseEventsUseCase,
  GetCaseTimelineUseCase,
  CreateTicketUseCase,
  ListTicketsUseCase,
  GetTicketUseCase,
  AssignTicketUseCase,
  ReplyToTicketUseCase,
  UpdateTicketStatusUseCase,
  CloseTicketUseCase,
  CreatePackageUseCase,
  UpdatePackageUseCase,
  DeletePackageUseCase,
  PublishPackageUseCase,
  UnpublishPackageUseCase,
  ListPackagesUseCase,
  GetPackageUseCase,
  CreateOrderUseCase,
  ListOrdersUseCase,
  GetOrderUseCase,
  UpdateOrderStatusUseCase,
  CreatePaymentIntentUseCase,
  RequestRefundUseCase,
  GetCaseJourneyUseCase,
  UpdateCaseJourneyUseCase,
  ListMilestonesUseCase,
  CreateMilestoneUseCase,
  UpdateMilestoneUseCase,
  DeleteMilestoneUseCase,
  CreateTemplateUseCase,
  UpdateTemplateUseCase,
  DeleteTemplateUseCase,
  ListTemplatesUseCase,
  GetTemplateUseCase,
  SubmitResponseUseCase,
  SaveResponseDraftUseCase,
  GetQCResponseUseCase,
  ListQCResponsesUseCase,
  CustomizeQuestionsUseCase,
  GetCustomizationUseCase,
  GetTemplateByDiseaseUseCase,
  CreateServiceCatalogItemUseCase,
  ListServiceCatalogItemsUseCase,
  GetServiceCatalogItemUseCase,
  UpdateServiceCatalogItemUseCase,
  DeleteServiceCatalogItemUseCase,
  ListAllServiceCatalogItemsUseCase,
  CreateQuoteTemplateUseCase,
  ListQuoteTemplatesUseCase,
  GetQuoteTemplateUseCase,
  UpdateQuoteTemplateUseCase,
  DeleteQuoteTemplateUseCase,
  PatientDashboardUseCase,
  AdminDashboardUseCase,
  HospitalDashboardUseCase,
  AdminPatientSiteAccessPolicy,
  GetPatientCasesUseCase,
  GetPatientCaseDetailUseCase,
  GetPatientConversationsUseCase,
  GetPatientSessionDetailUseCase,
  HandlePatientChatEventUseCase,
  SendRecordsUploadConfirmationUseCase,
  PatientAcceptQuoteUseCase,
  PatientRejectQuoteUseCase,
  GetIntakeTemplateUseCase,
  SubmitIntakeUseCase,
  SelectHospitalsUseCase,
  SkipMedicalFormUseCase,
  SubmitPatientQCResponseUseCase,
  GetPatientQCResponseUseCase,
  CreateBookingRequestUseCase,
  GetHospitalRecommendationsUseCase,
  SaveHospitalSelectionsUseCase,
  CompleteSignupUseCase,
  InitOnboardingUseCase,
  MatchHospitalsUseCase,
  SendMagicLinkUseCase,
  SendPatientOnboardingEmailUseCase,
  SendPatientLoginLinkUseCase,
  VerifyPatientEntryTokenUseCase,
  VerifyMagicLinkUseCase,
  LoginWithPasswordUseCase,
  RestoreGuestSessionUseCase,
  GetPatientSessionStateUseCase,
  UpdatePatientSessionProfileUseCase,
  SetPasswordUseCase,
  CreateFaqItemUseCase,
  ListFaqItemsUseCase,
  ListFaqCategoriesUseCase,
  ListFaqCategoriesForChatbotUseCase,
  EvaluateFaqRetrievalUseCase,
  CreateFaqCategoryUseCase,
  DeleteFaqCategoryUseCase,
  GetFaqItemUseCase,
  UpdateFaqItemUseCase,
  DeleteFaqItemUseCase,
  CreateEmailTemplateUseCase,
  ListEmailTemplatesUseCase,
  GetEmailTemplateUseCase,
  UpdateEmailTemplateUseCase,
  DeleteEmailTemplateUseCase,
  GetProfileUseCase,
  ListAdminEmailsUseCase,
  ListHospitalEmailsUseCase,
  UpdateProfileUseCase,
  ChangePasswordUseCase,
  NotificationEmailService,
  CreateEmailReplyTokenUseCase,
  ProcessInboundEmailUseCase,
  TranslationTaskService,
  ProcessTranslationTasksUseCase,
  RetryTranslationUseCase,
  GetTranslationStatusUseCase,
  AiSyncTaskService,
  ContextBuilderService,
  RiskResolverService,
  ActionPlannerService,
  RecommendationPolicyService,
  HandoffPolicyService,
  WritebackPlannerService,
  WritebackExecutorService,
  GetAiPolicyContextUseCase,
  DecideAiPolicyUseCase,
  ApplyAiPolicyWritebackUseCase,
  ResumeConversationAiUseCase,
} from '@medical-crm/application';
import type { IMagicLinkEmailService, IPatientOnboardingEmailService } from '@medical-crm/application';
import {
  DrizzleCaseRepository,
  DrizzleDocumentRepository,
  DrizzleCaseProgressRepository,
  DrizzleHospitalRepository,
  DrizzlePatientRepository,
  DrizzleHospitalManagementRepository,
  DrizzleRegistrationTokenRepository,
  DrizzleHospitalPasswordResetTokenRepository,
  DrizzleUserRepository,
  DrizzleUserEmailLookupRepository,
  DrizzleNotificationRecipientRepository,
  DrizzleEmailNotificationCooldownRepository,
  DrizzleEmailReplyTokenRepository,
  DrizzleInboundEmailEventRepository,
  DrizzleConversationRepository,
  DrizzleMessageRepository,
  DrizzleMessageTaskRepository,
  DrizzleConsultationRepository,
  DrizzleConsultationTranscriptRepository,
  DrizzleCHCRepository,
  DrizzleQuoteRepository,
  DrizzleCaseEventRepository,
  DrizzleSupportTicketRepository,
  DrizzleSupportTicketReplyRepository,
  DrizzlePackageRepository,
  DrizzleOrderRepository,
  DrizzleJourneyRepository,
  DrizzleQuestionCollectorRepository,
  DrizzleServiceCatalogRepository,
  DrizzleBookingRequestRepository,
  DrizzleChatbotFaqRepository,
  DrizzleEmailTemplateRepository,
  DrizzleTransactionRunner,
  DrizzleTranslationTaskRepository,
  DrizzleAiChatSessionRepository,
  DrizzleAiChatMessageRepository,
  DrizzleAiUserProfileRepository,
  DrizzleAiChatTimelineEventRepository,
  DrizzleAiFollowupTriggerRepository,
  DrizzleAiHandoffRepository,
  DrizzleAiSyncOutboxRepository,
  DrizzleDifyDocumentMappingRepository,
} from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { R2StorageAdapter } from '@medical-crm/infrastructure/storage/r2';
import { S3StorageAdapter } from '@medical-crm/infrastructure/storage/s3';
import { LocalFileStorageAdapter } from '@medical-crm/infrastructure/storage/local-file';
import { StorageAdapterRegistry } from '@medical-crm/infrastructure/storage/registry';
import { RoutedStorageService } from '@medical-crm/infrastructure/storage/routed';
import { ServerSideUploadService } from '@medical-crm/infrastructure/storage/server-side-upload';
import { MediaUploadService } from '@medical-crm/application/services/media-upload';
import {
  UploadPolicyRegistry,
  messageAttachmentPolicy,
  packageImagePolicy,
  guideHeroImagePolicy,
  guideContentImagePolicy,
  caseDocumentPolicy,
  chatbotRequestDocsPolicy,
  ticketReplyAttachmentPolicy,
  faqAttachmentPolicy,
  consultationRecordingPolicy,
  emailTemplateAttachmentPolicy,
  materialsBeautyPolicies,
  materialsRegularPolicies,
} from '@medical-crm/application/upload-policies';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getCrmSupabase } from '@medical-crm/infrastructure/supabase-crm';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';
import { KeycloakAdminService, SupabaseHospitalSyncService, OpenAITranslationService, RoutingMaterialsRepository, StubEmailService, SmtpEmailService, ResendEmailService, ResendInboundService, OpenAIBatchTranslationService, TranslationWritebackService, DifyApiClientService } from '@medical-crm/infrastructure/services';
import { SupabaseMaterialsRepository } from '@medical-crm/infrastructure/supabase-main/materials';
import { ChinaMedicalMaterialsRepository } from '@medical-crm/infrastructure/supabase-china/materials';
import { IdempotencyGuard } from '@medical-crm/infrastructure/database/idempotency';

interface AppServices {
  // infrastructure
  crmDb: ReturnType<typeof getCrmDb>;
  crmSupabase: ReturnType<typeof getCrmSupabase>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;
  idempotencyExecutor: Pick<IdempotencyGuard, 'execute'>;

  // repositories
  caseRepo: ICaseRepository;
  adminPatientSiteAccess: AdminPatientSiteAccessPolicy;
  documentRepo: IDocumentRepository;
  progressRepo: ICaseProgressRepository;
  hospitalRepo: IHospitalRepository;
  patientRepo: IPatientRepository;
  chcRepo: ICHCRepository;
  userEmailLookupRepo: IUserEmailLookupRepository;
  conversationRepo: IConversationRepository;
  messageRepo: IMessageRepository;
  aiChatSessionRepo: IAiChatSessionRepository;
  aiChatMessageRepo: IAiChatMessageRepository;
  aiUserProfileRepo: IAiUserProfileRepository;
  aiSyncOutboxRepo: IAiSyncOutboxRepository;
  difyDocumentMappingRepo: IDifyDocumentMappingRepository;
  storage: IStorageService;
  localFileStorage?: LocalFileStorageAdapter;
  txRunner: DrizzleTransactionRunner;
  mediaUpload: MediaUploadService;
  difyApi: DifyApiClientService;
  difyClassifierApi?: DifyApiClientService;
  difyFaqGroundingApi?: DifyApiClientService;
  resendInbound: ResendInboundService;
  resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>;

  // use cases — cases
  createCase: CreateCaseUseCase;
  listCases: ListCasesUseCase;
  getCase: GetCaseUseCase;
  getHospitalCaseDetail: GetHospitalCaseDetailUseCase;
  updateCase: UpdateCaseUseCase;
  saveCaseDiagnosis: SaveCaseDiagnosisUseCase;
  assignCase: AssignCaseUseCase;
  updateCaseStatus: UpdateCaseStatusUseCase;
  advanceCaseStage: AdvanceCaseStageUseCase;
  getCaseStats: GetCaseStatsUseCase;
  uploadDocument: UploadDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  getDocumentPreview: GetDocumentPreviewUseCase;
  deleteDocument: DeleteDocumentUseCase;
  getCaseProgress: GetCaseProgressUseCase;
  addCaseProgress: AddCaseProgressUseCase;

  // use cases — hospitals
  createHospital: CreateHospitalUseCase;
  listHospitals: ListHospitalsUseCase;
  publicListHospitals: PublicListHospitalsUseCase;
  publicGetHospital: PublicGetHospitalUseCase;
  getHospital: GetHospitalUseCase;
  updateHospital: UpdateHospitalUseCase;
  updateHospitalStatus: UpdateHospitalStatusUseCase;
  getHospitalCases: GetHospitalCasesUseCase;
  generateRegistrationToken: GenerateRegistrationTokenUseCase;
  registerHospitalUser: RegisterHospitalUserUseCase;
  validateRegistrationToken: ValidateRegistrationTokenUseCase;
  requestHospitalPasswordReset: RequestHospitalPasswordResetUseCase;
  validateHospitalPasswordResetToken: ValidateHospitalPasswordResetTokenUseCase;
  resetHospitalPassword: ResetHospitalPasswordUseCase;

  // use cases — conversations
  createConversation: CreateConversationUseCase;
  listConversations: ListConversationsUseCase;
  getConversation: GetConversationUseCase;
  updateConversation: UpdateConversationUseCase;
  resumeConversationAi: ResumeConversationAiUseCase;

  // use cases — messages
  sendMessage: SendMessageUseCase;
  listMessages: ListMessagesUseCase;
  getMessage: GetMessageUseCase;
  updateMessage: UpdateMessageUseCase;
  deleteMessage: DeleteMessageUseCase;
  listPendingReview: ListPendingReviewUseCase;
  approveMessage: ApproveMessageUseCase;
  rejectMessage: RejectMessageUseCase;
  regenerateSummary: RegenerateSummaryUseCase;
  retranslateMessage: RetranslateMessageUseCase;
  processMessageTasks: ProcessMessageTasksUseCase;
  processInboundEmail: ProcessInboundEmailUseCase;
  bootstrapAiSync: BootstrapAiSyncUseCase;

  // use cases — consultations
  createConsultation: CreateConsultationUseCase;
  getConsultation: GetConsultationUseCase;
  listConsultations: ListConsultationsUseCase;
  updateConsultation: UpdateConsultationUseCase;
  updateConsultationStatus: UpdateConsultationStatusUseCase;
  getConsultationTranscript: GetConsultationTranscriptUseCase;
  getConsultationStats: GetConsultationStatsUseCase;
  listCaseConsultations: ListCaseConsultationsUseCase;

  // use cases — CHC
  addHospitalToCase: AddHospitalToCaseUseCase;
  removeHospitalFromCase: RemoveHospitalFromCaseUseCase;
  sendReminder: SendReminderUseCase;
  listCaseHospitalContacts: ListCaseHospitalContactsUseCase;

  // use cases — quotes
  createQuote: CreateQuoteUseCase;
  updateQuote: UpdateQuoteUseCase;
  sendQuote: SendQuoteUseCase;
  listQuotes: ListQuotesUseCase;
  getQuote: GetQuoteUseCase;
  compareQuotes: CompareQuotesUseCase;
  resendQuote: ResendQuoteUseCase;
  acceptQuote: AcceptQuoteUseCase;
  rejectQuote: RejectQuoteUseCase;
  adminResetAssignment: AdminResetAssignmentUseCase;

  // use cases — events / timeline
  recordCaseEvent: RecordCaseEventUseCase;
  listCaseEvents: ListCaseEventsUseCase;
  getCaseTimeline: GetCaseTimelineUseCase;

  // use cases — support tickets
  createTicket: CreateTicketUseCase;
  listTickets: ListTicketsUseCase;
  getTicket: GetTicketUseCase;
  assignTicket: AssignTicketUseCase;
  replyToTicket: ReplyToTicketUseCase;
  updateTicketStatus: UpdateTicketStatusUseCase;
  closeTicket: CloseTicketUseCase;

  // use cases — packages
  createPackage: CreatePackageUseCase;
  updatePackage: UpdatePackageUseCase;
  deletePackage: DeletePackageUseCase;
  publishPackage: PublishPackageUseCase;
  unpublishPackage: UnpublishPackageUseCase;
  listPackages: ListPackagesUseCase;
  getPackage: GetPackageUseCase;

  // use cases — orders
  createOrder: CreateOrderUseCase;
  listOrders: ListOrdersUseCase;
  getOrder: GetOrderUseCase;
  updateOrderStatus: UpdateOrderStatusUseCase;
  createPaymentIntent: CreatePaymentIntentUseCase;
  requestRefund: RequestRefundUseCase;

  // use cases — journey
  getCaseJourney: GetCaseJourneyUseCase;
  updateCaseJourney: UpdateCaseJourneyUseCase;
  listMilestones: ListMilestonesUseCase;
  createMilestone: CreateMilestoneUseCase;
  updateMilestone: UpdateMilestoneUseCase;
  deleteMilestone: DeleteMilestoneUseCase;

  // use cases — question collector
  createTemplate: CreateTemplateUseCase;
  updateTemplate: UpdateTemplateUseCase;
  deleteTemplate: DeleteTemplateUseCase;
  listTemplates: ListTemplatesUseCase;
  getTemplate: GetTemplateUseCase;
  submitQCResponse: SubmitResponseUseCase;
  saveQCResponseDraft: SaveResponseDraftUseCase;
  getQCResponse: GetQCResponseUseCase;
  listQCResponses: ListQCResponsesUseCase;
  customizeQuestions: CustomizeQuestionsUseCase;
  getCustomization: GetCustomizationUseCase;
  getTemplateByDisease: GetTemplateByDiseaseUseCase;

  // use cases — service catalog
  createServiceCatalogItem: CreateServiceCatalogItemUseCase;
  listServiceCatalogItems: ListServiceCatalogItemsUseCase;
  getServiceCatalogItem: GetServiceCatalogItemUseCase;
  updateServiceCatalogItem: UpdateServiceCatalogItemUseCase;
  deleteServiceCatalogItem: DeleteServiceCatalogItemUseCase;
  listAllServiceCatalogItems: ListAllServiceCatalogItemsUseCase;

  // use cases — quote templates
  createQuoteTemplate: CreateQuoteTemplateUseCase;
  listQuoteTemplates: ListQuoteTemplatesUseCase;
  getQuoteTemplate: GetQuoteTemplateUseCase;
  updateQuoteTemplate: UpdateQuoteTemplateUseCase;
  deleteQuoteTemplate: DeleteQuoteTemplateUseCase;

  // use cases — dashboard
  patientDashboard: PatientDashboardUseCase;
  adminDashboard: AdminDashboardUseCase;
  hospitalDashboard: HospitalDashboardUseCase;

  // use cases — booking
  createBookingRequest: CreateBookingRequestUseCase;
  getHospitalRecommendations: GetHospitalRecommendationsUseCase;
  saveHospitalSelections: SaveHospitalSelectionsUseCase;
  completeSignup: CompleteSignupUseCase;

  // use cases — patient onboarding
  initOnboarding: InitOnboardingUseCase;
  matchHospitals: MatchHospitalsUseCase;

  // use cases — patient auth
  patientAuthService: PatientAuthService;
  sendMagicLink: SendMagicLinkUseCase;
  sendPatientOnboardingEmail: SendPatientOnboardingEmailUseCase;
  notifyAdminsOfNewCase: {
    execute(input: {
      caseId: string;
      patientId: string;
      patientName: string | null;
      patientEmail: string;
      site: import('@medical-crm/domain').PatientSite;
    }): Promise<void>;
  };
  notifyAdminsOfPatientMessage: {
    execute(input: {
      conversationId: string;
      caseId: string;
      patientId: string;
      patientName: string | null;
      messagePreview: string;
    }): Promise<void>;
  };
  notifyAdminsOfNewTicket: {
    execute(input: {
      ticketId: string;
      ticketNumber: string;
      patientId: string;
      patientName: string | null;
      subject: string | null;
      descriptionPreview: string;
    }): Promise<void>;
  };
  notifyPatientOfAdminMessage: {
    execute(input: {
      conversationId: string;
      caseId: string;
      patientId: string;
      messagePreview: string;
      site: import('@medical-crm/domain').PatientSite;
      isPatientOnline: boolean;
      channel?: import('@medical-crm/domain').EmailReplyChannel;
      hospitalId?: string | null;
      sourceKind?: string;
      sourceId?: string | null;
      resolveConversationId?: (() => Promise<string | null>) | null;
    }): Promise<void>;
  };
  notifyPatientOfCaseUpdate: {
    execute(input: {
      caseId: string;
      patientId: string;
      site: import('@medical-crm/domain').PatientSite;
      subject: string;
      messagePreview: string;
      bodyLines?: string[];
      dedupeKey?: string;
      conversationId?: string | null;
      channel?: import('@medical-crm/domain').EmailReplyChannel;
      hospitalId?: string | null;
      sourceKind?: string;
      sourceId?: string | null;
      resolveConversationId?: (() => Promise<string | null>) | null;
    }): Promise<void>;
  };
  sendPatientLoginLink: SendPatientLoginLinkUseCase;
  verifyPatientEntryToken: VerifyPatientEntryTokenUseCase;
  verifyMagicLink: VerifyMagicLinkUseCase;
  loginWithPassword: LoginWithPasswordUseCase;
  restoreGuestSession: RestoreGuestSessionUseCase;
  getPatientSessionState: GetPatientSessionStateUseCase;
  updatePatientSessionProfile: UpdatePatientSessionProfileUseCase;
  setPassword: SetPasswordUseCase;

  // use cases — patient dashboard
  getPatientCases: GetPatientCasesUseCase;
  getPatientCaseDetail: GetPatientCaseDetailUseCase;
  getPatientConversations: GetPatientConversationsUseCase;
  getPatientSessionDetail: GetPatientSessionDetailUseCase;
  handlePatientChatEvent: HandlePatientChatEventUseCase;
  patientAcceptQuote: PatientAcceptQuoteUseCase;
  patientRejectQuote: PatientRejectQuoteUseCase;
  getIntakeTemplate: GetIntakeTemplateUseCase;
  submitIntake: SubmitIntakeUseCase;
  selectHospitals: SelectHospitalsUseCase;
  skipMedicalForm: SkipMedicalFormUseCase;
  submitPatientQCResponse: SubmitPatientQCResponseUseCase;
  getPatientQCResponse: GetPatientQCResponseUseCase;

  // use cases — chatbot FAQ
  createFaqItem: CreateFaqItemUseCase;
  listFaqItems: ListFaqItemsUseCase;
  listFaqCategories: ListFaqCategoriesUseCase;
  listFaqCategoriesForChatbot: ListFaqCategoriesForChatbotUseCase;
  evaluateFaqRetrieval: EvaluateFaqRetrievalUseCase;
  createFaqCategory: CreateFaqCategoryUseCase;
  deleteFaqCategory: DeleteFaqCategoryUseCase;
  getFaqItem: GetFaqItemUseCase;
  updateFaqItem: UpdateFaqItemUseCase;
  deleteFaqItem: DeleteFaqItemUseCase;
  // use cases — email templates
  createEmailTemplate: CreateEmailTemplateUseCase;
  listEmailTemplates: ListEmailTemplatesUseCase;
  getEmailTemplate: GetEmailTemplateUseCase;
  updateEmailTemplate: UpdateEmailTemplateUseCase;
  deleteEmailTemplate: DeleteEmailTemplateUseCase;

  // use cases — user settings
  getProfile: GetProfileUseCase;
  listAdminEmails: ListAdminEmailsUseCase;
  listHospitalEmails: ListHospitalEmailsUseCase;
  updateProfile: UpdateProfileUseCase;
  changePassword: ChangePasswordUseCase;

  // use cases — translations
  processTranslationTasks: ProcessTranslationTasksUseCase;
  processAiSyncOutbox: ProcessAiSyncOutboxUseCase;
  getAiPolicyContext: GetAiPolicyContextUseCase;
  decideAiPolicy: DecideAiPolicyUseCase;
  applyAiPolicyWriteback: ApplyAiPolicyWritebackUseCase;
  retryTranslation: RetryTranslationUseCase;
  getTranslationStatus: GetTranslationStatusUseCase;

  // use cases — materials
  getHospitalInfo: GetHospitalInfoUseCase;
  getProcedures: GetProceduresUseCase;
  getSurgeons: GetSurgeonsUseCase;
  getBeforeAfterCases: GetBeforeAfterCasesUseCase;
  updateHospitalInfo: UpdateHospitalInfoUseCase;
  createProcedure: CreateProcedureUseCase;
  updateProcedure: UpdateProcedureUseCase;
  deleteProcedure: DeleteProcedureUseCase;
  createSurgeon: CreateSurgeonUseCase;
  updateSurgeon: UpdateSurgeonUseCase;
  deleteSurgeon: DeleteSurgeonUseCase;
  createBeforeAfterCase: CreateBeforeAfterCaseUseCase;
  updateBeforeAfterCase: UpdateBeforeAfterCaseUseCase;
  deleteBeforeAfterCase: DeleteBeforeAfterCaseUseCase;
  getMaterialsReviews: GetMaterialsReviewsUseCase;
  createMaterialsReview: CreateMaterialsReviewUseCase;
  updateMaterialsReview: UpdateMaterialsReviewUseCase;
  deleteMaterialsReview: DeleteMaterialsReviewUseCase;
  getMaterialsPackages: GetMaterialsPackagesUseCase;
  getMaterialsPackage: GetMaterialsPackageUseCase;
  createMaterialsPackage: CreateMaterialsPackageUseCase;
  updateMaterialsPackage: UpdateMaterialsPackageUseCase;
  deleteMaterialsPackage: DeleteMaterialsPackageUseCase;
}

let _services: AppServices | null = null;
let _resendInboundVerifier: ResendInboundService | null = null;

function resolveKeycloakAdminBaseUrl(): string {
  const configuredBaseUrl = process.env['KEYCLOAK_URL']?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const issuer = process.env['KEYCLOAK_ISSUER']?.trim();
  if (!issuer) {
    return '';
  }

  try {
    const url = new URL(issuer);
    const match = url.pathname.match(/^(.*)\/realms\/[^/]+\/?$/);
    url.pathname = match?.[1] || '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** Wire all infrastructure adapters, repositories, and use cases. Lazy singleton. */
export function getResendInboundVerifier(): ResendInboundService {
  if (!_resendInboundVerifier) {
    _resendInboundVerifier = new ResendInboundService();
  }
  return _resendInboundVerifier;
}

export function getServices(): AppServices {
  if (!_services) {
    const crmDb = getCrmDb();
    const crmSupabase = getCrmSupabase();
    const mainSupabase = getMainSupabase();
    const chinaSupabase = getChinaSupabase();

    // Repositories
    const caseRepo = new DrizzleCaseRepository(crmDb);
    const documentRepo = new DrizzleDocumentRepository(crmDb);
    const progressRepo = new DrizzleCaseProgressRepository(crmDb);
    const hospitalRepo = new DrizzleHospitalRepository(crmDb);
    const patientRepo = new DrizzlePatientRepository(crmDb);
    const userEmailLookupRepo = new DrizzleUserEmailLookupRepository(crmDb);
    const notificationRecipientRepo: INotificationRecipientRepository = new DrizzleNotificationRecipientRepository(crmDb);
    const emailNotificationCooldownRepo: IEmailNotificationCooldownRepository = new DrizzleEmailNotificationCooldownRepository(crmDb);
    const hospitalManagementRepo = new DrizzleHospitalManagementRepository(crmDb);
    const registrationTokenRepo = new DrizzleRegistrationTokenRepository(crmDb);
    const passwordResetTokenRepo = new DrizzleHospitalPasswordResetTokenRepository(crmDb);
    const userRepo = new DrizzleUserRepository(crmDb);
    const supabaseLegacyAdapter = new SupabaseStorageAdapter(mainSupabase);

    const r2Adapter = new R2StorageAdapter({
      accountId: process.env['R2_ACCOUNT_ID'] ?? '',
      accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
      bucketName: process.env['R2_BUCKET_NAME'] ?? '',
    });

    const r2MaterialsBeautyAdapter = new R2StorageAdapter({
      accountId: process.env['R2_ACCOUNT_ID'] ?? '',
      accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
      bucketName: process.env['R2_MATERIALS_BEAUTY_BUCKET_NAME'] ?? '',
      publicUrl: process.env['R2_MATERIALS_BEAUTY_PUBLIC_URL'],
    });

    const s3Adapter = new S3StorageAdapter({
      region: process.env['AWS_REGION'] ?? '',
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
      bucketName: process.env['AWS_S3_BUCKET'] ?? '',
      cloudfrontUrl: process.env['AWS_CLOUDFRONT_URL'],
    });

    // In local development, when R2 credentials are placeholders, fall back to
    // filesystem storage so uploads work without real cloud credentials.
    const useLocalFileStorage =
      process.env['USE_LOCAL_FILE_STORAGE'] === 'true' ||
      (process.env['NODE_ENV'] === 'development' &&
        (process.env['R2_ACCOUNT_ID'] ?? '').startsWith('local-'));

    let localFileStorage: LocalFileStorageAdapter | undefined;
    if (useLocalFileStorage) {
      const storageDir = process.env['LOCAL_FILE_STORAGE_DIR'] ?? join(process.cwd(), '..', '..', 'tmp', 'local-storage');
      const baseUrl = process.env['LOCAL_FILE_STORAGE_BASE_URL'] ?? 'http://localhost:3001/api/local-uploads';
      localFileStorage = new LocalFileStorageAdapter({ storageDir, baseUrl });
      console.info('[Storage] Using local filesystem storage for R2 backends in development.');
    }

    const storageAdapterRegistry = new StorageAdapterRegistry(
      {
        'r2-private': localFileStorage ?? r2Adapter,
        'r2-materials-beauty': localFileStorage ?? r2MaterialsBeautyAdapter,
        's3-materials': s3Adapter,
        'supabase-legacy': supabaseLegacyAdapter,
      },
      supabaseLegacyAdapter,
    );

    const routedStorageService = new RoutedStorageService(storageAdapterRegistry);

    const uploadPolicyRegistry = new UploadPolicyRegistry([
      messageAttachmentPolicy,
      packageImagePolicy,
      guideHeroImagePolicy,
      guideContentImagePolicy,
      caseDocumentPolicy,
      chatbotRequestDocsPolicy,
      ticketReplyAttachmentPolicy,
      faqAttachmentPolicy,
      consultationRecordingPolicy,
      emailTemplateAttachmentPolicy,
      ...materialsBeautyPolicies,
      ...materialsRegularPolicies,
    ]);

    const mediaUploadService = new MediaUploadService(uploadPolicyRegistry, storageAdapterRegistry);
    const serverSideUploadService = new ServerSideUploadService();
    const difyRequestTimeoutMs = Number.parseInt(
      process.env['DIFY_REQUEST_TIMEOUT_MS'] ?? '90000',
      10,
    );
    const difyApiClient = new DifyApiClientService(
      process.env['DIFY_API_BASE_URL'] ?? 'https://api.dify.ai/v1',
      process.env['DIFY_APP_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? '',
      Number.isFinite(difyRequestTimeoutMs) ? difyRequestTimeoutMs : 90_000,
      process.env['DIFY_DATASET_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? null,
    );
    const difyClassifierApiKey = process.env['DIFY_CLASSIFIER_APP_API_KEY']?.trim() ?? '';
    const difyClassifierApiClient = difyClassifierApiKey.length > 0
      ? new DifyApiClientService(
        process.env['DIFY_API_BASE_URL'] ?? 'https://api.dify.ai/v1',
        difyClassifierApiKey,
        Number.isFinite(difyRequestTimeoutMs) ? difyRequestTimeoutMs : 90_000,
        null,
      )
      : undefined;
    const difyFaqGroundingApiKey = process.env['DIFY_FAQ_GROUNDING_APP_API_KEY']?.trim() ?? '';
    const difyFaqGroundingApiClient = difyFaqGroundingApiKey.length > 0
      ? new DifyApiClientService(
        process.env['DIFY_API_BASE_URL'] ?? 'https://api.dify.ai/v1',
        difyFaqGroundingApiKey,
        Number.isFinite(difyRequestTimeoutMs) ? difyRequestTimeoutMs : 90_000,
        null,
      )
      : undefined;

    // Domain services
    const assignmentService = new CaseAssignmentService();
    const syncService = new SupabaseHospitalSyncService(mainSupabase, chinaSupabase);
    const keycloakAdmin = new KeycloakAdminService(
      resolveKeycloakAdminBaseUrl(),
      process.env['KEYCLOAK_REALM'] ?? '',
      process.env['KEYCLOAK_ADMIN_USERNAME'] ?? '',
      process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? '',
    );

    const conversationRepo = new DrizzleConversationRepository(crmDb);
    const messageRepo = new DrizzleMessageRepository(crmDb);
    const messageTaskRepo = new DrizzleMessageTaskRepository(crmDb);
    const translationService = new OpenAITranslationService(process.env['OPENAI_API_KEY'] ?? '');
    const consultationRepo = new DrizzleConsultationRepository(crmDb);
    const transcriptRepo = new DrizzleConsultationTranscriptRepository(crmDb);
    const aiChatSessionRepo = new DrizzleAiChatSessionRepository(crmDb);
    const aiChatMessageRepo = new DrizzleAiChatMessageRepository(crmDb);
    const aiUserProfileRepo = new DrizzleAiUserProfileRepository(crmDb);
    const aiChatTimelineEventRepo = new DrizzleAiChatTimelineEventRepository(crmDb);
    const aiFollowupTriggerRepo = new DrizzleAiFollowupTriggerRepository(crmDb);
    const aiHandoffRepo = new DrizzleAiHandoffRepository(crmDb);
    const aiSyncOutboxRepo = new DrizzleAiSyncOutboxRepository(crmDb);
    const difyDocumentMappingRepo = new DrizzleDifyDocumentMappingRepository(crmDb);
    // Materials: route to correct Supabase based on hospital type (COSMETIC → Main, REGULAR → China)
    const cosmeticMaterialsRepo = new SupabaseMaterialsRepository(mainSupabase, routedStorageService);
    const regularMaterialsRepo = new ChinaMedicalMaterialsRepository(chinaSupabase, routedStorageService);
    const sharedReviewPackageMaterialsRepo = new SupabaseMaterialsRepository(crmSupabase, routedStorageService);

    // Hospital type resolver — uses DrizzleHospitalManagementRepository to look up type
    const hospitalTypeCache = new Map<string, 'COSMETIC' | 'REGULAR'>();
    const resolveHospitalType = async (hospitalId: string): Promise<'COSMETIC' | 'REGULAR'> => {
      const cached = hospitalTypeCache.get(hospitalId);
      if (cached) return cached;

      const hospital = await hospitalManagementRepo.findFullById(hospitalId);
      const type = hospital?.type === 'REGULAR' ? 'REGULAR' as const : 'COSMETIC' as const;
      hospitalTypeCache.set(hospitalId, type);
      return type;
    };

    const materialsRepo = new RoutingMaterialsRepository(
      cosmeticMaterialsRepo,
      regularMaterialsRepo,
      sharedReviewPackageMaterialsRepo,
      resolveHospitalType,
    );
    const resendEmailService = ResendEmailService.fromEnv();
    const smtpEmailService = SmtpEmailService.fromEnv();
    if (!resendEmailService && !smtpEmailService) {
      console.warn('[EMAIL] Neither RESEND nor SMTP is configured; falling back to StubEmailService.');
    }
    const rawEmailService = resendEmailService ?? smtpEmailService ?? new StubEmailService();
    const fallbackEmailService = new StubEmailService();
    const emailService = {
      async sendHospitalInvitation(params: {
        to: string;
        hospitalName: string;
        registrationUrl: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendHospitalInvitation(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Hospital invitation delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendHospitalInvitation(params);
            return;
          }
          throw error;
        }
      },
      async sendHospitalPasswordReset(params: {
        to: string;
        hospitalName: string;
        resetUrl: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendHospitalPasswordReset(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Hospital password-reset delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendHospitalPasswordReset(params);
            return;
          }
          throw error;
        }
      },
      async sendPatientMagicLink(params: {
        to: string;
        magicLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendPatientMagicLink(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Patient magic link delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendPatientMagicLink(params);
            return;
          }
          throw error;
        }
      },
      async sendPatientOnboardingConfirmation(params: {
        to: string;
        dashboardLink: string;
        locale?: string | null;
        summary: {
          country?: string | null;
          department?: string | null;
          condition?: string | null;
          destination?: string | null;
          treatmentTimeline?: string | null;
        };
      }) {
        try {
          await rawEmailService.sendPatientOnboardingConfirmation(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Patient onboarding delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendPatientOnboardingConfirmation(params);
            return;
          }
          throw error;
        }
      },
      async sendPatientRecordsUploadConfirmation(params: {
        to: string;
        patientName: string;
        fileName: string;
        dashboardLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendPatientRecordsUploadConfirmation(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Patient records upload confirmation failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendPatientRecordsUploadConfirmation(params);
            return;
          }
          throw error;
        }
      },
      async sendAdminNewCaseAlert(params: {
        to: string;
        patientName: string;
        patientEmail: string;
        adminPortalLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendAdminNewCaseAlert(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Admin new-case delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendAdminNewCaseAlert(params);
            return;
          }
          throw error;
        }
      },
      async sendAdminNewMessageAlert(params: {
        to: string;
        patientName: string;
        messagePreview: string;
        adminPortalLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendAdminNewMessageAlert(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Admin message alert delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendAdminNewMessageAlert(params);
            return;
          }
          throw error;
        }
      },
      async sendAdminNewTicketAlert(params: {
        to: string;
        ticketNumber: string;
        patientName: string;
        subject: string;
        descriptionPreview: string;
        adminPortalLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendAdminNewTicketAlert(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Admin ticket alert delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendAdminNewTicketAlert(params);
            return;
          }
          throw error;
        }
      },
      async sendPatientNewMessageAlert(params: {
        to: string;
        patientName: string;
        messagePreview: string;
        dashboardLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendPatientNewMessageAlert(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Patient message alert delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendPatientNewMessageAlert(params);
            return;
          }
          throw error;
        }
      },
      async sendPatientCaseUpdateAlert(params: {
        to: string;
        patientName: string;
        subject: string;
        messagePreview: string;
        bodyLines?: string[];
        dashboardLink: string;
        locale?: string | null;
      }) {
        try {
          await rawEmailService.sendPatientCaseUpdateAlert(params);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[EMAIL] Patient case-update delivery failed in development, falling back to preview log.', error);
            await fallbackEmailService.sendPatientCaseUpdateAlert(params);
            return;
          }
          throw error;
        }
      },
    };

    // Patient auth
    const patientJwtSecret = process.env['PATIENT_JWT_SECRET'];
    const nodeEnv = process.env.NODE_ENV;
    const allowDevSecret = nodeEnv === 'development' || nodeEnv === 'test';
    if (!patientJwtSecret && !allowDevSecret) {
      throw new Error('PATIENT_JWT_SECRET must be configured outside development/test');
    }
    const patientAuthService = new PatientAuthService(patientJwtSecret ?? 'dev-patient-secret');
    const magicLinkEmailService: IMagicLinkEmailService = {
      sendMagicLink: async (email, link, locale) => {
        await emailService.sendPatientMagicLink({
          to: email,
          magicLink: link,
          locale,
        });
      },
    };
    const patientOnboardingEmailService: IPatientOnboardingEmailService = {
      sendOnboardingEmail: async ({ email, dashboardLink, locale, summary }) => {
        await emailService.sendPatientOnboardingConfirmation({
          to: email,
          dashboardLink,
          locale,
          summary,
        });
      },
    };
    const emailReplyTokenRepo = new DrizzleEmailReplyTokenRepository(crmDb);
    const inboundEventRepo = new DrizzleInboundEmailEventRepository(crmDb);
    const resendInboundService = getResendInboundVerifier();
    const createEmailReplyToken = new CreateEmailReplyTokenUseCase(emailReplyTokenRepo);
    const notificationEmailService = new NotificationEmailService(
      notificationRecipientRepo,
      emailNotificationCooldownRepo,
      emailService,
      { createEmailReplyToken },
    );

    const chcRepo = new DrizzleCHCRepository(crmDb);
    const quoteRepo = new DrizzleQuoteRepository(crmDb);
    const eventRepo = new DrizzleCaseEventRepository(crmDb);
    const ticketRepo = new DrizzleSupportTicketRepository(crmDb);
    const ticketReplyRepo = new DrizzleSupportTicketReplyRepository(crmDb);
    const packageRepo = new DrizzlePackageRepository(crmDb);
    const orderRepo = new DrizzleOrderRepository(crmDb);
    const journeyRepo = new DrizzleJourneyRepository(crmDb);
    const qcRepo = new DrizzleQuestionCollectorRepository(crmDb);
    const serviceCatalogRepo = new DrizzleServiceCatalogRepository(crmDb);
    const bookingRequestRepo = new DrizzleBookingRequestRepository(crmDb);
    const faqRepo = new DrizzleChatbotFaqRepository(crmDb);
    const emailTemplateRepo = new DrizzleEmailTemplateRepository(crmDb);
    const txRunner = new DrizzleTransactionRunner(crmDb);
    const adminPatientSiteAccess = new AdminPatientSiteAccessPolicy(caseRepo, userRepo);
    const sendMessage = new SendMessageUseCase(
      conversationRepo,
      messageRepo,
      translationService,
      messageTaskRepo,
      patientRepo,
      userRepo,
      caseRepo,
      txRunner,
      adminPatientSiteAccess,
    );
    const processInboundEmail = new ProcessInboundEmailUseCase({
      replyTokenRepo: emailReplyTokenRepo,
      inboundEventRepo,
      conversationRepo,
      caseRepo,
      patientRepo,
      mediaUpload: mediaUploadService,
      attachmentSource: resendInboundService,
      attachmentUploader: serverSideUploadService,
      sendMessage,
    });
    const idempotencyGuard = new IdempotencyGuard(crmDb);
    const translationTaskRepo = new DrizzleTranslationTaskRepository(crmDb);
    const translationTaskService = new TranslationTaskService(translationTaskRepo);
    const aiSyncTaskService = new AiSyncTaskService(aiSyncOutboxRepo);
    const contextBuilderService = new ContextBuilderService(
      aiChatSessionRepo,
      aiChatMessageRepo,
      aiUserProfileRepo,
      aiChatTimelineEventRepo,
      aiFollowupTriggerRepo,
      aiHandoffRepo,
    );
    const riskResolverService = new RiskResolverService();
    const actionPlannerService = new ActionPlannerService();
    const recommendationPolicyService = new RecommendationPolicyService();
    const handoffPolicyService = new HandoffPolicyService();
    const writebackPlannerService = new WritebackPlannerService();
    const writebackExecutorService = new WritebackExecutorService(
      aiChatSessionRepo,
      aiUserProfileRepo,
      aiChatMessageRepo,
      aiChatTimelineEventRepo,
      aiFollowupTriggerRepo,
      aiHandoffRepo,
      writebackPlannerService,
      handoffPolicyService,
    );
    const batchTranslationService = new OpenAIBatchTranslationService(process.env['OPENAI_API_KEY'] ?? '');
    const translationWritebackService = new TranslationWritebackService(crmDb, mainSupabase, chinaSupabase, crmSupabase);

    const listCases = new ListCasesUseCase(caseRepo);
    const uploadDocument = new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo, chcRepo, adminPatientSiteAccess);
    const getPatientSessionDetail = new GetPatientSessionDetailUseCase(
      conversationRepo,
      messageRepo,
      aiChatSessionRepo,
      aiChatMessageRepo,
      routedStorageService,
      hospitalRepo,
    );
    const sendRecordsUploadConfirmation = new SendRecordsUploadConfirmationUseCase(userRepo, emailService);
    const handlePatientChatEvent = new HandlePatientChatEventUseCase(
      conversationRepo,
      messageRepo,
      aiChatSessionRepo,
      getPatientSessionDetail,
      uploadDocument,
      sendRecordsUploadConfirmation,
    );

    _services = {
      crmDb, crmSupabase, mainSupabase, chinaSupabase,
      idempotencyExecutor: idempotencyGuard,
      caseRepo, adminPatientSiteAccess, documentRepo, progressRepo, hospitalRepo, patientRepo, chcRepo, userEmailLookupRepo, conversationRepo, messageRepo, aiChatSessionRepo, aiChatMessageRepo, aiSyncOutboxRepo, difyDocumentMappingRepo,
      storage: routedStorageService,
      localFileStorage,
      txRunner,
      mediaUpload: mediaUploadService,
      difyApi: difyApiClient,
      difyClassifierApi: difyClassifierApiClient,
      difyFaqGroundingApi: difyFaqGroundingApiClient,
      resendInbound: resendInboundService,
      resolveHospitalType,

      createCase: new CreateCaseUseCase(caseRepo, adminPatientSiteAccess),
      listCases,
      getCase: new GetCaseUseCase(caseRepo, userRepo, hospitalRepo, chcRepo, adminPatientSiteAccess),
      getHospitalCaseDetail: new GetHospitalCaseDetailUseCase(caseRepo, progressRepo, documentRepo, routedStorageService, patientRepo, conversationRepo, messageRepo, chcRepo),
      updateCase: new UpdateCaseUseCase(caseRepo, chcRepo, adminPatientSiteAccess),
      saveCaseDiagnosis: new SaveCaseDiagnosisUseCase(caseRepo, progressRepo, chcRepo, adminPatientSiteAccess),
      assignCase: new AssignCaseUseCase(caseRepo, hospitalRepo, assignmentService, progressRepo, adminPatientSiteAccess),
      updateCaseStatus: new UpdateCaseStatusUseCase(caseRepo, progressRepo, adminPatientSiteAccess),
      advanceCaseStage: new AdvanceCaseStageUseCase(caseRepo, progressRepo, adminPatientSiteAccess),
      getCaseStats: new GetCaseStatsUseCase(caseRepo),
      uploadDocument,
      listDocuments: new ListDocumentsUseCase(documentRepo, caseRepo, routedStorageService, chcRepo, adminPatientSiteAccess),
      getDocumentPreview: new GetDocumentPreviewUseCase(documentRepo, caseRepo, routedStorageService, chcRepo, undefined, adminPatientSiteAccess),
      deleteDocument: new DeleteDocumentUseCase(documentRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      getCaseProgress: new GetCaseProgressUseCase(progressRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      addCaseProgress: new AddCaseProgressUseCase(progressRepo, caseRepo, chcRepo, adminPatientSiteAccess),

      createHospital: new CreateHospitalUseCase(hospitalManagementRepo, syncService),
      listHospitals: new ListHospitalsUseCase(hospitalManagementRepo),
      publicListHospitals: new PublicListHospitalsUseCase(hospitalManagementRepo),
      publicGetHospital: new PublicGetHospitalUseCase(hospitalManagementRepo),
      getHospital: new GetHospitalUseCase(hospitalManagementRepo, userRepo, materialsRepo),
      updateHospital: new UpdateHospitalUseCase(hospitalManagementRepo, syncService),
      updateHospitalStatus: new UpdateHospitalStatusUseCase(hospitalManagementRepo, syncService),
      getHospitalCases: new GetHospitalCasesUseCase(hospitalManagementRepo, listCases),
      generateRegistrationToken: new GenerateRegistrationTokenUseCase(hospitalManagementRepo, registrationTokenRepo, emailService, userRepo, keycloakAdmin),
      registerHospitalUser: new RegisterHospitalUserUseCase(registrationTokenRepo, keycloakAdmin, hospitalManagementRepo, userRepo),
      validateRegistrationToken: new ValidateRegistrationTokenUseCase(registrationTokenRepo, hospitalManagementRepo),
      requestHospitalPasswordReset: new RequestHospitalPasswordResetUseCase(userRepo, hospitalManagementRepo, passwordResetTokenRepo, emailService),
      validateHospitalPasswordResetToken: new ValidateHospitalPasswordResetTokenUseCase(passwordResetTokenRepo, hospitalManagementRepo),
      resetHospitalPassword: new ResetHospitalPasswordUseCase(passwordResetTokenRepo, keycloakAdmin),

      createConversation: new CreateConversationUseCase(conversationRepo, caseRepo, hospitalRepo, adminPatientSiteAccess),
      listConversations: new ListConversationsUseCase(conversationRepo, adminPatientSiteAccess),
      getConversation: new GetConversationUseCase(conversationRepo, adminPatientSiteAccess),
      updateConversation: new UpdateConversationUseCase(conversationRepo, adminPatientSiteAccess),
      resumeConversationAi: new ResumeConversationAiUseCase(conversationRepo, messageRepo, txRunner, adminPatientSiteAccess),
      sendMessage,
      listMessages: new ListMessagesUseCase(conversationRepo, messageRepo, routedStorageService, adminPatientSiteAccess),
      getMessage: new GetMessageUseCase(conversationRepo, messageRepo, routedStorageService, adminPatientSiteAccess),
      updateMessage: new UpdateMessageUseCase(conversationRepo, messageRepo, adminPatientSiteAccess),
      deleteMessage: new DeleteMessageUseCase(conversationRepo, messageRepo, adminPatientSiteAccess),
      listPendingReview: new ListPendingReviewUseCase(messageRepo, conversationRepo, adminPatientSiteAccess),
      approveMessage: new ApproveMessageUseCase(messageRepo, conversationRepo, adminPatientSiteAccess),
      rejectMessage: new RejectMessageUseCase(messageRepo, conversationRepo, adminPatientSiteAccess),
      regenerateSummary: new RegenerateSummaryUseCase(messageRepo, translationService, conversationRepo, adminPatientSiteAccess),
      retranslateMessage: new RetranslateMessageUseCase(messageRepo, translationService, conversationRepo, adminPatientSiteAccess),
      processMessageTasks: new ProcessMessageTasksUseCase(messageTaskRepo, messageRepo, translationService),
      processInboundEmail,

      createConsultation: new CreateConsultationUseCase(consultationRepo, caseRepo, translationTaskService, chcRepo, adminPatientSiteAccess),
      getConsultation: new GetConsultationUseCase(consultationRepo, adminPatientSiteAccess),
      listConsultations: new ListConsultationsUseCase(consultationRepo),
      updateConsultation: new UpdateConsultationUseCase(consultationRepo, translationTaskService, adminPatientSiteAccess),
      updateConsultationStatus: new UpdateConsultationStatusUseCase(consultationRepo, adminPatientSiteAccess),
      getConsultationTranscript: new GetConsultationTranscriptUseCase(consultationRepo, transcriptRepo, adminPatientSiteAccess),
      getConsultationStats: new GetConsultationStatsUseCase(consultationRepo),
      listCaseConsultations: new ListCaseConsultationsUseCase(consultationRepo, caseRepo, chcRepo, adminPatientSiteAccess),

      recordCaseEvent: new RecordCaseEventUseCase(eventRepo),
      listCaseEvents: new ListCaseEventsUseCase(eventRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      getCaseTimeline: new GetCaseTimelineUseCase(eventRepo, journeyRepo, caseRepo, chcRepo, adminPatientSiteAccess),

      addHospitalToCase: new AddHospitalToCaseUseCase(chcRepo, caseRepo, hospitalRepo, userRepo, adminPatientSiteAccess),
      removeHospitalFromCase: new RemoveHospitalFromCaseUseCase(chcRepo, adminPatientSiteAccess),
      sendReminder: new SendReminderUseCase(chcRepo, adminPatientSiteAccess),
      listCaseHospitalContacts: new ListCaseHospitalContactsUseCase(chcRepo, caseRepo, adminPatientSiteAccess),

      createQuote: new CreateQuoteUseCase(quoteRepo, caseRepo, adminPatientSiteAccess),
      updateQuote: new UpdateQuoteUseCase(quoteRepo, caseRepo, adminPatientSiteAccess),
      sendQuote: new SendQuoteUseCase(quoteRepo, chcRepo, caseRepo, adminPatientSiteAccess),
      listQuotes: new ListQuotesUseCase(quoteRepo, caseRepo, adminPatientSiteAccess),
      getQuote: new GetQuoteUseCase(quoteRepo, caseRepo, adminPatientSiteAccess),
      compareQuotes: new CompareQuotesUseCase(quoteRepo, adminPatientSiteAccess),
      resendQuote: new ResendQuoteUseCase(quoteRepo, chcRepo, caseRepo, adminPatientSiteAccess),
      acceptQuote: new AcceptQuoteUseCase(quoteRepo, chcRepo, caseRepo, txRunner, adminPatientSiteAccess),
      rejectQuote: new RejectQuoteUseCase(quoteRepo, chcRepo, adminPatientSiteAccess),
      adminResetAssignment: new AdminResetAssignmentUseCase(chcRepo, caseRepo, txRunner, adminPatientSiteAccess),

      createTicket: new CreateTicketUseCase(ticketRepo, translationTaskService, adminPatientSiteAccess),
      listTickets: new ListTicketsUseCase(ticketRepo),
      getTicket: new GetTicketUseCase(ticketRepo, ticketReplyRepo, adminPatientSiteAccess),
      assignTicket: new AssignTicketUseCase(ticketRepo, adminPatientSiteAccess),
      replyToTicket: new ReplyToTicketUseCase(ticketRepo, ticketReplyRepo, translationTaskService, adminPatientSiteAccess),
      updateTicketStatus: new UpdateTicketStatusUseCase(ticketRepo, adminPatientSiteAccess),
      closeTicket: new CloseTicketUseCase(ticketRepo, adminPatientSiteAccess),

      createPackage: new CreatePackageUseCase(packageRepo),
      updatePackage: new UpdatePackageUseCase(packageRepo),
      deletePackage: new DeletePackageUseCase(packageRepo, aiSyncTaskService),
      publishPackage: new PublishPackageUseCase(packageRepo, aiSyncTaskService),
      unpublishPackage: new UnpublishPackageUseCase(packageRepo, aiSyncTaskService),
      listPackages: new ListPackagesUseCase(packageRepo),
      getPackage: new GetPackageUseCase(packageRepo),

      getCaseJourney: new GetCaseJourneyUseCase(journeyRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      updateCaseJourney: new UpdateCaseJourneyUseCase(journeyRepo, caseRepo, adminPatientSiteAccess),
      listMilestones: new ListMilestonesUseCase(journeyRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      createMilestone: new CreateMilestoneUseCase(journeyRepo, caseRepo, adminPatientSiteAccess),
      updateMilestone: new UpdateMilestoneUseCase(journeyRepo, caseRepo, adminPatientSiteAccess),
      deleteMilestone: new DeleteMilestoneUseCase(journeyRepo, caseRepo, adminPatientSiteAccess),

      createOrder: new CreateOrderUseCase(orderRepo, idempotencyGuard, adminPatientSiteAccess),
      listOrders: new ListOrdersUseCase(orderRepo),
      getOrder: new GetOrderUseCase(orderRepo, adminPatientSiteAccess),
      updateOrderStatus: new UpdateOrderStatusUseCase(orderRepo, adminPatientSiteAccess),
      createPaymentIntent: new CreatePaymentIntentUseCase(orderRepo),
      requestRefund: new RequestRefundUseCase(orderRepo),

      createTemplate: new CreateTemplateUseCase(qcRepo, translationTaskService),
      updateTemplate: new UpdateTemplateUseCase(qcRepo, translationTaskService),
      deleteTemplate: new DeleteTemplateUseCase(qcRepo),
      listTemplates: new ListTemplatesUseCase(qcRepo),
      getTemplate: new GetTemplateUseCase(qcRepo, caseRepo),
      submitQCResponse: new SubmitResponseUseCase(qcRepo, caseRepo, translationTaskService),
      saveQCResponseDraft: new SaveResponseDraftUseCase(qcRepo, caseRepo),
      getQCResponse: new GetQCResponseUseCase(qcRepo, caseRepo, chcRepo, adminPatientSiteAccess),
      listQCResponses: new ListQCResponsesUseCase(qcRepo),
      customizeQuestions: new CustomizeQuestionsUseCase(qcRepo),
      getCustomization: new GetCustomizationUseCase(qcRepo),
      getTemplateByDisease: new GetTemplateByDiseaseUseCase(qcRepo),

      createServiceCatalogItem: new CreateServiceCatalogItemUseCase(serviceCatalogRepo),
      listServiceCatalogItems: new ListServiceCatalogItemsUseCase(serviceCatalogRepo),
      getServiceCatalogItem: new GetServiceCatalogItemUseCase(serviceCatalogRepo),
      updateServiceCatalogItem: new UpdateServiceCatalogItemUseCase(serviceCatalogRepo),
      deleteServiceCatalogItem: new DeleteServiceCatalogItemUseCase(serviceCatalogRepo),
      listAllServiceCatalogItems: new ListAllServiceCatalogItemsUseCase(serviceCatalogRepo),

      createQuoteTemplate: new CreateQuoteTemplateUseCase(serviceCatalogRepo),
      listQuoteTemplates: new ListQuoteTemplatesUseCase(serviceCatalogRepo),
      getQuoteTemplate: new GetQuoteTemplateUseCase(serviceCatalogRepo),
      updateQuoteTemplate: new UpdateQuoteTemplateUseCase(serviceCatalogRepo),
      deleteQuoteTemplate: new DeleteQuoteTemplateUseCase(serviceCatalogRepo),

      getPatientCases: new GetPatientCasesUseCase(caseRepo),
      getPatientCaseDetail: new GetPatientCaseDetailUseCase(caseRepo),
      getPatientConversations: new GetPatientConversationsUseCase(conversationRepo, hospitalRepo),
      getPatientSessionDetail,
      handlePatientChatEvent,
      patientAcceptQuote: new PatientAcceptQuoteUseCase(quoteRepo, caseRepo),
      patientRejectQuote: new PatientRejectQuoteUseCase(quoteRepo, caseRepo),
      getIntakeTemplate: new GetIntakeTemplateUseCase(),
      submitIntake: new SubmitIntakeUseCase(),
      selectHospitals: new SelectHospitalsUseCase(caseRepo, chcRepo, conversationRepo),
      skipMedicalForm: new SkipMedicalFormUseCase(caseRepo),
      submitPatientQCResponse: new SubmitPatientQCResponseUseCase(qcRepo, caseRepo, patientRepo, aiChatSessionRepo, aiChatMessageRepo, txRunner),
      getPatientQCResponse: new GetPatientQCResponseUseCase(qcRepo, caseRepo),

      patientDashboard: new PatientDashboardUseCase(caseRepo, orderRepo, journeyRepo),
      adminDashboard: new AdminDashboardUseCase(caseRepo, ticketRepo, orderRepo),
      hospitalDashboard: new HospitalDashboardUseCase(caseRepo, quoteRepo, consultationRepo),

      createBookingRequest: new CreateBookingRequestUseCase(bookingRequestRepo),
      getHospitalRecommendations: new GetHospitalRecommendationsUseCase(bookingRequestRepo),
      saveHospitalSelections: new SaveHospitalSelectionsUseCase(bookingRequestRepo),
      completeSignup: new CompleteSignupUseCase(bookingRequestRepo),

      initOnboarding: new InitOnboardingUseCase(
        patientRepo,
        userEmailLookupRepo,
        caseRepo,
        conversationRepo,
        aiChatSessionRepo,
        patientAuthService,
      ),
      matchHospitals: new MatchHospitalsUseCase(hospitalRepo),

      patientAuthService,
      sendMagicLink: new SendMagicLinkUseCase(patientRepo, patientAuthService, magicLinkEmailService),
      sendPatientOnboardingEmail: new SendPatientOnboardingEmailUseCase(patientAuthService, patientOnboardingEmailService),
      notifyAdminsOfNewCase: {
        execute: (input) => notificationEmailService.notifyAdminsOfNewCase(input),
      },
      notifyAdminsOfPatientMessage: {
        execute: (input) => notificationEmailService.notifyAdminsOfPatientMessage(input),
      },
      notifyAdminsOfNewTicket: {
        execute: (input) => notificationEmailService.notifyAdminsOfNewTicket(input),
      },
      notifyPatientOfAdminMessage: {
        execute: (input) => notificationEmailService.notifyPatientOfAdminMessage(input),
      },
      notifyPatientOfCaseUpdate: {
        execute: (input) => notificationEmailService.notifyPatientOfCaseUpdate(input),
      },
      sendPatientLoginLink: new SendPatientLoginLinkUseCase(userEmailLookupRepo, patientAuthService, magicLinkEmailService),
      verifyPatientEntryToken: new VerifyPatientEntryTokenUseCase(patientAuthService),
      verifyMagicLink: new VerifyMagicLinkUseCase(patientRepo, patientAuthService),
      loginWithPassword: new LoginWithPasswordUseCase(patientRepo, patientAuthService),
      restoreGuestSession: new RestoreGuestSessionUseCase(patientRepo, patientAuthService),
      getPatientSessionState: new GetPatientSessionStateUseCase(
        patientRepo,
        userRepo,
        caseRepo,
        chcRepo,
        conversationRepo,
        aiChatMessageRepo,
        aiChatSessionRepo,
      ),
      updatePatientSessionProfile: new UpdatePatientSessionProfileUseCase(caseRepo),
      setPassword: new SetPasswordUseCase(patientRepo),

      createFaqItem: new CreateFaqItemUseCase(faqRepo, translationTaskService, aiSyncTaskService),
      listFaqItems: new ListFaqItemsUseCase(faqRepo, routedStorageService),
      listFaqCategories: new ListFaqCategoriesUseCase(faqRepo),
      listFaqCategoriesForChatbot: new ListFaqCategoriesForChatbotUseCase(faqRepo),
      evaluateFaqRetrieval: new EvaluateFaqRetrievalUseCase(faqRepo),
      createFaqCategory: new CreateFaqCategoryUseCase(faqRepo, translationTaskService),
      deleteFaqCategory: new DeleteFaqCategoryUseCase(faqRepo),
      getFaqItem: new GetFaqItemUseCase(faqRepo, routedStorageService),
      updateFaqItem: new UpdateFaqItemUseCase(faqRepo, translationTaskService, aiSyncTaskService),
      deleteFaqItem: new DeleteFaqItemUseCase(faqRepo, aiSyncTaskService),
      createEmailTemplate: new CreateEmailTemplateUseCase(emailTemplateRepo),
      listEmailTemplates: new ListEmailTemplatesUseCase(emailTemplateRepo, routedStorageService),
      getEmailTemplate: new GetEmailTemplateUseCase(emailTemplateRepo, routedStorageService),
      updateEmailTemplate: new UpdateEmailTemplateUseCase(emailTemplateRepo),
      deleteEmailTemplate: new DeleteEmailTemplateUseCase(emailTemplateRepo),

      getProfile: new GetProfileUseCase(userRepo),
      listAdminEmails: new ListAdminEmailsUseCase(userRepo),
      listHospitalEmails: new ListHospitalEmailsUseCase(userRepo),
      updateProfile: new UpdateProfileUseCase(userRepo, keycloakAdmin),
      changePassword: new ChangePasswordUseCase(
        keycloakAdmin,
        process.env['KEYCLOAK_CLIENT_ID'] ?? 'admin-cli',
        process.env['KEYCLOAK_CLIENT_SECRET'],
      ),

      processTranslationTasks: new ProcessTranslationTasksUseCase(translationTaskRepo, batchTranslationService, translationWritebackService),
      bootstrapAiSync: new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService),
      processAiSyncOutbox: new ProcessAiSyncOutboxUseCase(aiSyncOutboxRepo, difyDocumentMappingRepo, difyApiClient),
      aiUserProfileRepo,
      getAiPolicyContext: new GetAiPolicyContextUseCase(contextBuilderService),
      decideAiPolicy: new DecideAiPolicyUseCase(
        contextBuilderService,
        riskResolverService,
        actionPlannerService,
        recommendationPolicyService,
      ),
      applyAiPolicyWriteback: new ApplyAiPolicyWritebackUseCase(
        aiChatSessionRepo,
        writebackExecutorService,
        idempotencyGuard,
      ),
      retryTranslation: new RetryTranslationUseCase(translationTaskRepo),
      getTranslationStatus: new GetTranslationStatusUseCase(translationTaskRepo),

      getHospitalInfo: new GetHospitalInfoUseCase(materialsRepo),
      getProcedures: new GetProceduresUseCase(materialsRepo),
      getSurgeons: new GetSurgeonsUseCase(materialsRepo),
      getBeforeAfterCases: new GetBeforeAfterCasesUseCase(materialsRepo),
      updateHospitalInfo: new UpdateHospitalInfoUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      createProcedure: new CreateProcedureUseCase(materialsRepo),
      updateProcedure: new UpdateProcedureUseCase(materialsRepo),
      deleteProcedure: new DeleteProcedureUseCase(materialsRepo),
      createSurgeon: new CreateSurgeonUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      updateSurgeon: new UpdateSurgeonUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      deleteSurgeon: new DeleteSurgeonUseCase(materialsRepo),
      createBeforeAfterCase: new CreateBeforeAfterCaseUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      updateBeforeAfterCase: new UpdateBeforeAfterCaseUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      deleteBeforeAfterCase: new DeleteBeforeAfterCaseUseCase(materialsRepo),
      getMaterialsReviews: new GetMaterialsReviewsUseCase(materialsRepo, resolveHospitalType),
      createMaterialsReview: new CreateMaterialsReviewUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      updateMaterialsReview: new UpdateMaterialsReviewUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      deleteMaterialsReview: new DeleteMaterialsReviewUseCase(materialsRepo, resolveHospitalType),
      getMaterialsPackages: new GetMaterialsPackagesUseCase(materialsRepo, resolveHospitalType),
      getMaterialsPackage: new GetMaterialsPackageUseCase(materialsRepo, resolveHospitalType),
      createMaterialsPackage: new CreateMaterialsPackageUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      updateMaterialsPackage: new UpdateMaterialsPackageUseCase(materialsRepo, resolveHospitalType, translationTaskService),
      deleteMaterialsPackage: new DeleteMaterialsPackageUseCase(materialsRepo, resolveHospitalType),
    };
  }
  return _services!;
}
