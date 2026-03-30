import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  IHospitalRepository,
  IPatientRepository,
  IStorageService,
  IAiChatSessionRepository,
  IAiChatMessageRepository,
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
  AssignCaseUseCase,
  UpdateCaseStatusUseCase,
  AdvanceCaseStageUseCase,
  GetCaseStatsUseCase,
  UploadDocumentUseCase,
  ListDocumentsUseCase,
  DeleteDocumentUseCase,
  GetCaseProgressUseCase,
  AddCaseProgressUseCase,
  CreateHospitalUseCase,
  ListHospitalsUseCase,
  GetHospitalUseCase,
  UpdateHospitalUseCase,
  UpdateHospitalStatusUseCase,
  GetHospitalCasesUseCase,
  GenerateRegistrationTokenUseCase,
  RegisterHospitalUserUseCase,
  ValidateRegistrationTokenUseCase,
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
  GetPatientCasesUseCase,
  GetPatientCaseDetailUseCase,
  GetPatientConversationsUseCase,
  PatientAcceptQuoteUseCase,
  PatientRejectQuoteUseCase,
  GetIntakeTemplateUseCase,
  SubmitIntakeUseCase,
  SelectHospitalsUseCase,
  CreateBookingRequestUseCase,
  GetHospitalRecommendationsUseCase,
  SaveHospitalSelectionsUseCase,
  CompleteSignupUseCase,
  InitOnboardingUseCase,
  MatchHospitalsUseCase,
  SendMagicLinkUseCase,
  VerifyMagicLinkUseCase,
  SetPasswordUseCase,
  CreateFaqItemUseCase,
  ListFaqItemsUseCase,
  ListFaqCategoriesUseCase,
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
  UpdateProfileUseCase,
  ChangePasswordUseCase,
  TranslationTaskService,
  ProcessTranslationTasksUseCase,
  RetryTranslationUseCase,
  GetTranslationStatusUseCase,
  AiSyncTaskService,
} from '@medical-crm/application';
import type { IMagicLinkEmailService } from '@medical-crm/application';
import {
  DrizzleCaseRepository,
  DrizzleDocumentRepository,
  DrizzleCaseProgressRepository,
  DrizzleHospitalRepository,
  DrizzlePatientRepository,
  DrizzleHospitalManagementRepository,
  DrizzleRegistrationTokenRepository,
  DrizzleUserRepository,
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
  DrizzleAiSyncOutboxRepository,
  DrizzleDifyDocumentMappingRepository,
} from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { R2StorageAdapter } from '@medical-crm/infrastructure/storage/r2';
import { S3StorageAdapter } from '@medical-crm/infrastructure/storage/s3';
import { StorageAdapterRegistry } from '@medical-crm/infrastructure/storage/registry';
import { RoutedStorageService } from '@medical-crm/infrastructure/storage/routed';
import { MediaUploadService } from '@medical-crm/application/services/media-upload';
import {
  UploadPolicyRegistry,
  messageAttachmentPolicy,
  packageImagePolicy,
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
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';
import { KeycloakAdminService, SupabaseHospitalSyncService, OpenAITranslationService, RoutingMaterialsRepository, StubEmailService, SmtpEmailService, ResendEmailService, OpenAIBatchTranslationService, TranslationWritebackService, DifyApiClientService } from '@medical-crm/infrastructure/services';
import { SupabaseMaterialsRepository } from '@medical-crm/infrastructure/supabase-main/materials';
import { ChinaMedicalMaterialsRepository } from '@medical-crm/infrastructure/supabase-china/materials';
import { IdempotencyGuard } from '@medical-crm/infrastructure/database/idempotency';

interface AppServices {
  // infrastructure
  crmDb: ReturnType<typeof getCrmDb>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;

  // repositories
  caseRepo: ICaseRepository;
  documentRepo: IDocumentRepository;
  progressRepo: ICaseProgressRepository;
  hospitalRepo: IHospitalRepository;
  patientRepo: IPatientRepository;
  aiChatSessionRepo: IAiChatSessionRepository;
  aiChatMessageRepo: IAiChatMessageRepository;
  aiSyncOutboxRepo: IAiSyncOutboxRepository;
  difyDocumentMappingRepo: IDifyDocumentMappingRepository;
  storage: IStorageService;
  mediaUpload: MediaUploadService;
  difyApi: DifyApiClientService;
  resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>;

  // use cases — cases
  createCase: CreateCaseUseCase;
  listCases: ListCasesUseCase;
  getCase: GetCaseUseCase;
  getHospitalCaseDetail: GetHospitalCaseDetailUseCase;
  updateCase: UpdateCaseUseCase;
  assignCase: AssignCaseUseCase;
  updateCaseStatus: UpdateCaseStatusUseCase;
  advanceCaseStage: AdvanceCaseStageUseCase;
  getCaseStats: GetCaseStatsUseCase;
  uploadDocument: UploadDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  deleteDocument: DeleteDocumentUseCase;
  getCaseProgress: GetCaseProgressUseCase;
  addCaseProgress: AddCaseProgressUseCase;

  // use cases — hospitals
  createHospital: CreateHospitalUseCase;
  listHospitals: ListHospitalsUseCase;
  getHospital: GetHospitalUseCase;
  updateHospital: UpdateHospitalUseCase;
  updateHospitalStatus: UpdateHospitalStatusUseCase;
  getHospitalCases: GetHospitalCasesUseCase;
  generateRegistrationToken: GenerateRegistrationTokenUseCase;
  registerHospitalUser: RegisterHospitalUserUseCase;
  validateRegistrationToken: ValidateRegistrationTokenUseCase;

  // use cases — conversations
  createConversation: CreateConversationUseCase;
  listConversations: ListConversationsUseCase;
  getConversation: GetConversationUseCase;
  updateConversation: UpdateConversationUseCase;

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
  verifyMagicLink: VerifyMagicLinkUseCase;
  setPassword: SetPasswordUseCase;

  // use cases — patient dashboard
  getPatientCases: GetPatientCasesUseCase;
  getPatientCaseDetail: GetPatientCaseDetailUseCase;
  getPatientConversations: GetPatientConversationsUseCase;
  patientAcceptQuote: PatientAcceptQuoteUseCase;
  patientRejectQuote: PatientRejectQuoteUseCase;
  getIntakeTemplate: GetIntakeTemplateUseCase;
  submitIntake: SubmitIntakeUseCase;
  selectHospitals: SelectHospitalsUseCase;

  // use cases — chatbot FAQ
  createFaqItem: CreateFaqItemUseCase;
  listFaqItems: ListFaqItemsUseCase;
  listFaqCategories: ListFaqCategoriesUseCase;
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
  updateProfile: UpdateProfileUseCase;
  changePassword: ChangePasswordUseCase;

  // use cases — translations
  processTranslationTasks: ProcessTranslationTasksUseCase;
  processAiSyncOutbox: ProcessAiSyncOutboxUseCase;
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
}

let _services: AppServices | null = null;

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
export function getServices(): AppServices {
  if (!_services) {
    const crmDb = getCrmDb();
    const mainSupabase = getMainSupabase();
    const chinaSupabase = getChinaSupabase();

    // Repositories
    const caseRepo = new DrizzleCaseRepository(crmDb);
    const documentRepo = new DrizzleDocumentRepository(crmDb);
    const progressRepo = new DrizzleCaseProgressRepository(crmDb);
    const hospitalRepo = new DrizzleHospitalRepository(crmDb);
    const patientRepo = new DrizzlePatientRepository(crmDb);
    const hospitalManagementRepo = new DrizzleHospitalManagementRepository(crmDb);
    const registrationTokenRepo = new DrizzleRegistrationTokenRepository(crmDb);
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

    const storageAdapterRegistry = new StorageAdapterRegistry(
      {
        'r2-private': r2Adapter,
        'r2-materials-beauty': r2MaterialsBeautyAdapter,
        's3-materials': s3Adapter,
        'supabase-legacy': supabaseLegacyAdapter,
      },
      supabaseLegacyAdapter,
    );

    const routedStorageService = new RoutedStorageService(storageAdapterRegistry);

    const uploadPolicyRegistry = new UploadPolicyRegistry([
      messageAttachmentPolicy,
      packageImagePolicy,
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
    const difyApiClient = new DifyApiClientService(
      process.env['DIFY_API_BASE_URL'] ?? 'https://api.dify.ai/v1',
      process.env['DIFY_APP_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? '',
      30_000,
      process.env['DIFY_DATASET_API_KEY'] ?? process.env['DIFY_API_KEY'] ?? null,
    );

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
    const aiSyncOutboxRepo = new DrizzleAiSyncOutboxRepository(crmDb);
    const difyDocumentMappingRepo = new DrizzleDifyDocumentMappingRepository(crmDb);
    // Materials: route to correct Supabase based on hospital type (COSMETIC → Main, REGULAR → China)
    const cosmeticMaterialsRepo = new SupabaseMaterialsRepository(mainSupabase, routedStorageService);
    const regularMaterialsRepo = new ChinaMedicalMaterialsRepository(chinaSupabase, routedStorageService);

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

    const materialsRepo = new RoutingMaterialsRepository(cosmeticMaterialsRepo, regularMaterialsRepo, resolveHospitalType);
    const resendEmailService = ResendEmailService.fromEnv();
    const smtpEmailService = SmtpEmailService.fromEnv();
    if (!resendEmailService && !smtpEmailService) {
      console.warn('[EMAIL] Neither RESEND nor SMTP is configured; falling back to StubEmailService.');
    }
    const emailService = resendEmailService ?? smtpEmailService ?? new StubEmailService();

    // Patient auth
    const patientJwtSecret = process.env['PATIENT_JWT_SECRET'];
    const nodeEnv = process.env.NODE_ENV;
    const allowDevSecret = nodeEnv === 'development' || nodeEnv === 'test';
    if (!patientJwtSecret && !allowDevSecret) {
      throw new Error('PATIENT_JWT_SECRET must be configured outside development/test');
    }
    const patientAuthService = new PatientAuthService(patientJwtSecret ?? 'dev-patient-secret');
    const magicLinkEmailService: IMagicLinkEmailService = {
      sendMagicLink: async (email, link) => {
        const hasToken = link.includes('token=');
        console.log(`[STUB] Magic link generated for ${email}${hasToken ? ' (token redacted)' : ''}`);
      },
    };

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
    const idempotencyGuard = new IdempotencyGuard(crmDb);
    const translationTaskRepo = new DrizzleTranslationTaskRepository(crmDb);
    const translationTaskService = new TranslationTaskService(translationTaskRepo);
    const aiSyncTaskService = new AiSyncTaskService(aiSyncOutboxRepo);
    const batchTranslationService = new OpenAIBatchTranslationService(process.env['OPENAI_API_KEY'] ?? '');
    const translationWritebackService = new TranslationWritebackService(crmDb, mainSupabase, chinaSupabase);

    const listCases = new ListCasesUseCase(caseRepo);

    _services = {
      crmDb, mainSupabase, chinaSupabase,
      caseRepo, documentRepo, progressRepo, hospitalRepo, patientRepo, aiChatSessionRepo, aiChatMessageRepo, aiSyncOutboxRepo, difyDocumentMappingRepo,
      storage: routedStorageService,
      mediaUpload: mediaUploadService,
      difyApi: difyApiClient,
      resolveHospitalType,

      createCase: new CreateCaseUseCase(caseRepo),
      listCases,
      getCase: new GetCaseUseCase(caseRepo, userRepo, hospitalRepo),
      getHospitalCaseDetail: new GetHospitalCaseDetailUseCase(caseRepo, progressRepo, documentRepo, routedStorageService, patientRepo, conversationRepo, messageRepo),
      updateCase: new UpdateCaseUseCase(caseRepo),
      assignCase: new AssignCaseUseCase(caseRepo, hospitalRepo, assignmentService, progressRepo),
      updateCaseStatus: new UpdateCaseStatusUseCase(caseRepo, progressRepo),
      advanceCaseStage: new AdvanceCaseStageUseCase(caseRepo, progressRepo),
      getCaseStats: new GetCaseStatsUseCase(caseRepo),
      uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo),
      listDocuments: new ListDocumentsUseCase(documentRepo, caseRepo, routedStorageService),
      deleteDocument: new DeleteDocumentUseCase(documentRepo, caseRepo),
      getCaseProgress: new GetCaseProgressUseCase(progressRepo, caseRepo),
      addCaseProgress: new AddCaseProgressUseCase(progressRepo, caseRepo),

      createHospital: new CreateHospitalUseCase(hospitalManagementRepo, syncService),
      listHospitals: new ListHospitalsUseCase(hospitalManagementRepo),
      getHospital: new GetHospitalUseCase(hospitalManagementRepo, userRepo),
      updateHospital: new UpdateHospitalUseCase(hospitalManagementRepo, syncService),
      updateHospitalStatus: new UpdateHospitalStatusUseCase(hospitalManagementRepo),
      getHospitalCases: new GetHospitalCasesUseCase(hospitalManagementRepo, listCases),
      generateRegistrationToken: new GenerateRegistrationTokenUseCase(hospitalManagementRepo, registrationTokenRepo, emailService),
      registerHospitalUser: new RegisterHospitalUserUseCase(registrationTokenRepo, keycloakAdmin, hospitalManagementRepo, userRepo),
      validateRegistrationToken: new ValidateRegistrationTokenUseCase(registrationTokenRepo, hospitalManagementRepo),

      createConversation: new CreateConversationUseCase(conversationRepo, caseRepo, hospitalRepo),
      listConversations: new ListConversationsUseCase(conversationRepo),
      getConversation: new GetConversationUseCase(conversationRepo),
      updateConversation: new UpdateConversationUseCase(conversationRepo),
      sendMessage: new SendMessageUseCase(conversationRepo, messageRepo, translationService, messageTaskRepo, patientRepo, userRepo, caseRepo),
      listMessages: new ListMessagesUseCase(conversationRepo, messageRepo, routedStorageService),
      getMessage: new GetMessageUseCase(conversationRepo, messageRepo, routedStorageService),
      updateMessage: new UpdateMessageUseCase(conversationRepo, messageRepo),
      deleteMessage: new DeleteMessageUseCase(conversationRepo, messageRepo),
      listPendingReview: new ListPendingReviewUseCase(messageRepo),
      approveMessage: new ApproveMessageUseCase(messageRepo),
      rejectMessage: new RejectMessageUseCase(messageRepo),
      regenerateSummary: new RegenerateSummaryUseCase(messageRepo, translationService),
      retranslateMessage: new RetranslateMessageUseCase(messageRepo, translationService),
      processMessageTasks: new ProcessMessageTasksUseCase(messageTaskRepo, messageRepo, translationService),

      createConsultation: new CreateConsultationUseCase(consultationRepo, caseRepo, translationTaskService),
      getConsultation: new GetConsultationUseCase(consultationRepo),
      listConsultations: new ListConsultationsUseCase(consultationRepo),
      updateConsultation: new UpdateConsultationUseCase(consultationRepo, translationTaskService),
      updateConsultationStatus: new UpdateConsultationStatusUseCase(consultationRepo),
      getConsultationTranscript: new GetConsultationTranscriptUseCase(consultationRepo, transcriptRepo),
      getConsultationStats: new GetConsultationStatsUseCase(consultationRepo),
      listCaseConsultations: new ListCaseConsultationsUseCase(consultationRepo, caseRepo),

      recordCaseEvent: new RecordCaseEventUseCase(eventRepo),
      listCaseEvents: new ListCaseEventsUseCase(eventRepo, caseRepo),
      getCaseTimeline: new GetCaseTimelineUseCase(eventRepo, journeyRepo, caseRepo),

      addHospitalToCase: new AddHospitalToCaseUseCase(chcRepo),
      removeHospitalFromCase: new RemoveHospitalFromCaseUseCase(chcRepo),
      sendReminder: new SendReminderUseCase(chcRepo),
      listCaseHospitalContacts: new ListCaseHospitalContactsUseCase(chcRepo, caseRepo),

      createQuote: new CreateQuoteUseCase(quoteRepo),
      updateQuote: new UpdateQuoteUseCase(quoteRepo),
      sendQuote: new SendQuoteUseCase(quoteRepo, chcRepo),
      listQuotes: new ListQuotesUseCase(quoteRepo, caseRepo),
      getQuote: new GetQuoteUseCase(quoteRepo, caseRepo),
      compareQuotes: new CompareQuotesUseCase(quoteRepo),
      resendQuote: new ResendQuoteUseCase(quoteRepo, chcRepo),
      acceptQuote: new AcceptQuoteUseCase(quoteRepo, chcRepo, caseRepo, txRunner),
      rejectQuote: new RejectQuoteUseCase(quoteRepo, chcRepo),
      adminResetAssignment: new AdminResetAssignmentUseCase(chcRepo, caseRepo, txRunner),

      createTicket: new CreateTicketUseCase(ticketRepo, translationTaskService),
      listTickets: new ListTicketsUseCase(ticketRepo),
      getTicket: new GetTicketUseCase(ticketRepo, ticketReplyRepo),
      assignTicket: new AssignTicketUseCase(ticketRepo),
      replyToTicket: new ReplyToTicketUseCase(ticketRepo, ticketReplyRepo, translationTaskService),
      updateTicketStatus: new UpdateTicketStatusUseCase(ticketRepo),
      closeTicket: new CloseTicketUseCase(ticketRepo),

      createPackage: new CreatePackageUseCase(packageRepo),
      updatePackage: new UpdatePackageUseCase(packageRepo),
      deletePackage: new DeletePackageUseCase(packageRepo, aiSyncTaskService),
      publishPackage: new PublishPackageUseCase(packageRepo, aiSyncTaskService),
      unpublishPackage: new UnpublishPackageUseCase(packageRepo, aiSyncTaskService),
      listPackages: new ListPackagesUseCase(packageRepo),
      getPackage: new GetPackageUseCase(packageRepo),

      getCaseJourney: new GetCaseJourneyUseCase(journeyRepo, caseRepo),
      updateCaseJourney: new UpdateCaseJourneyUseCase(journeyRepo, caseRepo),
      listMilestones: new ListMilestonesUseCase(journeyRepo, caseRepo),
      createMilestone: new CreateMilestoneUseCase(journeyRepo, caseRepo),
      updateMilestone: new UpdateMilestoneUseCase(journeyRepo),
      deleteMilestone: new DeleteMilestoneUseCase(journeyRepo),

      createOrder: new CreateOrderUseCase(orderRepo, idempotencyGuard),
      listOrders: new ListOrdersUseCase(orderRepo),
      getOrder: new GetOrderUseCase(orderRepo),
      updateOrderStatus: new UpdateOrderStatusUseCase(orderRepo),
      createPaymentIntent: new CreatePaymentIntentUseCase(orderRepo),
      requestRefund: new RequestRefundUseCase(orderRepo),

      createTemplate: new CreateTemplateUseCase(qcRepo, translationTaskService),
      updateTemplate: new UpdateTemplateUseCase(qcRepo, translationTaskService),
      deleteTemplate: new DeleteTemplateUseCase(qcRepo),
      listTemplates: new ListTemplatesUseCase(qcRepo),
      getTemplate: new GetTemplateUseCase(qcRepo, caseRepo),
      submitQCResponse: new SubmitResponseUseCase(qcRepo, caseRepo, translationTaskService),
      saveQCResponseDraft: new SaveResponseDraftUseCase(qcRepo, caseRepo),
      getQCResponse: new GetQCResponseUseCase(qcRepo, caseRepo),
      listQCResponses: new ListQCResponsesUseCase(qcRepo),
      customizeQuestions: new CustomizeQuestionsUseCase(qcRepo),
      getCustomization: new GetCustomizationUseCase(qcRepo),

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
      getPatientConversations: new GetPatientConversationsUseCase(conversationRepo),
      patientAcceptQuote: new PatientAcceptQuoteUseCase(quoteRepo, caseRepo),
      patientRejectQuote: new PatientRejectQuoteUseCase(quoteRepo, caseRepo),
      getIntakeTemplate: new GetIntakeTemplateUseCase(),
      submitIntake: new SubmitIntakeUseCase(),
      selectHospitals: new SelectHospitalsUseCase(caseRepo, chcRepo, conversationRepo),

      patientDashboard: new PatientDashboardUseCase(caseRepo, orderRepo, journeyRepo),
      adminDashboard: new AdminDashboardUseCase(caseRepo, ticketRepo, orderRepo),
      hospitalDashboard: new HospitalDashboardUseCase(caseRepo, quoteRepo, consultationRepo),

      createBookingRequest: new CreateBookingRequestUseCase(bookingRequestRepo),
      getHospitalRecommendations: new GetHospitalRecommendationsUseCase(bookingRequestRepo),
      saveHospitalSelections: new SaveHospitalSelectionsUseCase(bookingRequestRepo),
      completeSignup: new CompleteSignupUseCase(bookingRequestRepo),

      initOnboarding: new InitOnboardingUseCase(patientRepo, caseRepo, patientAuthService),
      matchHospitals: new MatchHospitalsUseCase(hospitalRepo),

      patientAuthService,
      sendMagicLink: new SendMagicLinkUseCase(patientRepo, patientAuthService, magicLinkEmailService),
      verifyMagicLink: new VerifyMagicLinkUseCase(patientRepo, patientAuthService),
      setPassword: new SetPasswordUseCase(patientRepo),

      createFaqItem: new CreateFaqItemUseCase(faqRepo, translationTaskService, aiSyncTaskService),
      listFaqItems: new ListFaqItemsUseCase(faqRepo, routedStorageService),
      listFaqCategories: new ListFaqCategoriesUseCase(faqRepo),
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
      updateProfile: new UpdateProfileUseCase(userRepo, keycloakAdmin),
      changePassword: new ChangePasswordUseCase(
        keycloakAdmin,
        process.env['KEYCLOAK_CLIENT_ID'] ?? 'admin-cli',
        process.env['KEYCLOAK_CLIENT_SECRET'],
      ),

      processTranslationTasks: new ProcessTranslationTasksUseCase(translationTaskRepo, batchTranslationService, translationWritebackService),
      bootstrapAiSync: new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService),
      processAiSyncOutbox: new ProcessAiSyncOutboxUseCase(aiSyncOutboxRepo, difyDocumentMappingRepo, difyApiClient),
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
    };
  }
  return _services;
}
