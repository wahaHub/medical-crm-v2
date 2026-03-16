import type {
  ICaseRepository,
  IDocumentRepository,
  ICaseProgressRepository,
  IHospitalRepository,
  IPatientRepository,
  IStorageService,
} from '@medical-crm/domain';
import { CaseAssignmentService } from '@medical-crm/domain';
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
} from '@medical-crm/application';
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
  DrizzleTransactionRunner,
} from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';
import { KeycloakAdminService, SupabaseHospitalSyncService, OpenAITranslationService } from '@medical-crm/infrastructure/services';
import { SupabaseMaterialsRepository } from '@medical-crm/infrastructure/supabase-main/materials';

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
  storage: IStorageService;

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
    const storage = new SupabaseStorageAdapter(mainSupabase);

    // Domain services
    const assignmentService = new CaseAssignmentService();
    const syncService = new SupabaseHospitalSyncService(mainSupabase, chinaSupabase);
    const keycloakAdmin = new KeycloakAdminService(
      process.env['KEYCLOAK_URL'] ?? '',
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
    const materialsRepo = new SupabaseMaterialsRepository(mainSupabase);
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
    const txRunner = new DrizzleTransactionRunner(crmDb);

    const listCases = new ListCasesUseCase(caseRepo);

    _services = {
      crmDb, mainSupabase, chinaSupabase,
      caseRepo, documentRepo, progressRepo, hospitalRepo, patientRepo, storage,

      createCase: new CreateCaseUseCase(caseRepo),
      listCases,
      getCase: new GetCaseUseCase(caseRepo),
      getHospitalCaseDetail: new GetHospitalCaseDetailUseCase(caseRepo, progressRepo, documentRepo, storage, patientRepo),
      updateCase: new UpdateCaseUseCase(caseRepo),
      assignCase: new AssignCaseUseCase(caseRepo, hospitalRepo, assignmentService, progressRepo),
      updateCaseStatus: new UpdateCaseStatusUseCase(caseRepo, progressRepo),
      advanceCaseStage: new AdvanceCaseStageUseCase(caseRepo, progressRepo),
      getCaseStats: new GetCaseStatsUseCase(caseRepo),
      uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo, storage),
      listDocuments: new ListDocumentsUseCase(documentRepo, caseRepo, storage),
      deleteDocument: new DeleteDocumentUseCase(documentRepo, caseRepo),
      getCaseProgress: new GetCaseProgressUseCase(progressRepo, caseRepo),
      addCaseProgress: new AddCaseProgressUseCase(progressRepo, caseRepo),

      createHospital: new CreateHospitalUseCase(hospitalManagementRepo, syncService),
      listHospitals: new ListHospitalsUseCase(hospitalManagementRepo),
      getHospital: new GetHospitalUseCase(hospitalManagementRepo),
      updateHospital: new UpdateHospitalUseCase(hospitalManagementRepo, syncService),
      updateHospitalStatus: new UpdateHospitalStatusUseCase(hospitalManagementRepo),
      getHospitalCases: new GetHospitalCasesUseCase(hospitalManagementRepo, listCases),
      generateRegistrationToken: new GenerateRegistrationTokenUseCase(hospitalManagementRepo, registrationTokenRepo),
      registerHospitalUser: new RegisterHospitalUserUseCase(registrationTokenRepo, keycloakAdmin, hospitalManagementRepo, userRepo),

      createConversation: new CreateConversationUseCase(conversationRepo),
      listConversations: new ListConversationsUseCase(conversationRepo),
      getConversation: new GetConversationUseCase(conversationRepo),
      updateConversation: new UpdateConversationUseCase(conversationRepo),
      sendMessage: new SendMessageUseCase(conversationRepo, messageRepo, translationService, messageTaskRepo, patientRepo, userRepo, caseRepo),
      listMessages: new ListMessagesUseCase(conversationRepo, messageRepo),
      getMessage: new GetMessageUseCase(conversationRepo, messageRepo),
      updateMessage: new UpdateMessageUseCase(conversationRepo, messageRepo),
      deleteMessage: new DeleteMessageUseCase(conversationRepo, messageRepo),
      listPendingReview: new ListPendingReviewUseCase(messageRepo),
      approveMessage: new ApproveMessageUseCase(messageRepo),
      rejectMessage: new RejectMessageUseCase(messageRepo),
      regenerateSummary: new RegenerateSummaryUseCase(messageRepo, translationService),
      retranslateMessage: new RetranslateMessageUseCase(messageRepo, translationService),
      processMessageTasks: new ProcessMessageTasksUseCase(messageTaskRepo, messageRepo, translationService),

      createConsultation: new CreateConsultationUseCase(consultationRepo, caseRepo),
      getConsultation: new GetConsultationUseCase(consultationRepo),
      listConsultations: new ListConsultationsUseCase(consultationRepo),
      updateConsultation: new UpdateConsultationUseCase(consultationRepo),
      updateConsultationStatus: new UpdateConsultationStatusUseCase(consultationRepo),
      getConsultationTranscript: new GetConsultationTranscriptUseCase(consultationRepo, transcriptRepo),
      getConsultationStats: new GetConsultationStatsUseCase(consultationRepo),
      listCaseConsultations: new ListCaseConsultationsUseCase(consultationRepo, caseRepo),

      recordCaseEvent: new RecordCaseEventUseCase(eventRepo),
      listCaseEvents: new ListCaseEventsUseCase(eventRepo),
      getCaseTimeline: new GetCaseTimelineUseCase(eventRepo, journeyRepo),

      addHospitalToCase: new AddHospitalToCaseUseCase(chcRepo),
      removeHospitalFromCase: new RemoveHospitalFromCaseUseCase(chcRepo),
      sendReminder: new SendReminderUseCase(chcRepo),
      listCaseHospitalContacts: new ListCaseHospitalContactsUseCase(chcRepo),

      createQuote: new CreateQuoteUseCase(quoteRepo),
      updateQuote: new UpdateQuoteUseCase(quoteRepo),
      sendQuote: new SendQuoteUseCase(quoteRepo, chcRepo),
      listQuotes: new ListQuotesUseCase(quoteRepo),
      getQuote: new GetQuoteUseCase(quoteRepo),
      compareQuotes: new CompareQuotesUseCase(quoteRepo),
      resendQuote: new ResendQuoteUseCase(quoteRepo, chcRepo),
      acceptQuote: new AcceptQuoteUseCase(quoteRepo, chcRepo, caseRepo, txRunner),
      rejectQuote: new RejectQuoteUseCase(quoteRepo, chcRepo),
      adminResetAssignment: new AdminResetAssignmentUseCase(chcRepo, caseRepo, txRunner),

      createTicket: new CreateTicketUseCase(ticketRepo),
      listTickets: new ListTicketsUseCase(ticketRepo),
      getTicket: new GetTicketUseCase(ticketRepo, ticketReplyRepo),
      assignTicket: new AssignTicketUseCase(ticketRepo),
      replyToTicket: new ReplyToTicketUseCase(ticketRepo, ticketReplyRepo),
      updateTicketStatus: new UpdateTicketStatusUseCase(ticketRepo),
      closeTicket: new CloseTicketUseCase(ticketRepo),

      createPackage: new CreatePackageUseCase(packageRepo),
      updatePackage: new UpdatePackageUseCase(packageRepo),
      publishPackage: new PublishPackageUseCase(packageRepo),
      unpublishPackage: new UnpublishPackageUseCase(packageRepo),
      listPackages: new ListPackagesUseCase(packageRepo),
      getPackage: new GetPackageUseCase(packageRepo),

      getCaseJourney: new GetCaseJourneyUseCase(journeyRepo, caseRepo),
      updateCaseJourney: new UpdateCaseJourneyUseCase(journeyRepo, caseRepo),
      listMilestones: new ListMilestonesUseCase(journeyRepo, caseRepo),
      createMilestone: new CreateMilestoneUseCase(journeyRepo, caseRepo),
      updateMilestone: new UpdateMilestoneUseCase(journeyRepo),
      deleteMilestone: new DeleteMilestoneUseCase(journeyRepo),

      createOrder: new CreateOrderUseCase(orderRepo),
      listOrders: new ListOrdersUseCase(orderRepo),
      getOrder: new GetOrderUseCase(orderRepo),
      updateOrderStatus: new UpdateOrderStatusUseCase(orderRepo),
      createPaymentIntent: new CreatePaymentIntentUseCase(orderRepo),
      requestRefund: new RequestRefundUseCase(orderRepo),

      createTemplate: new CreateTemplateUseCase(qcRepo),
      updateTemplate: new UpdateTemplateUseCase(qcRepo),
      listTemplates: new ListTemplatesUseCase(qcRepo),
      getTemplate: new GetTemplateUseCase(qcRepo, caseRepo),
      submitQCResponse: new SubmitResponseUseCase(qcRepo, caseRepo),
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

      getHospitalInfo: new GetHospitalInfoUseCase(materialsRepo),
      getProcedures: new GetProceduresUseCase(materialsRepo),
      getSurgeons: new GetSurgeonsUseCase(materialsRepo),
      getBeforeAfterCases: new GetBeforeAfterCasesUseCase(materialsRepo),
      updateHospitalInfo: new UpdateHospitalInfoUseCase(materialsRepo),
      createProcedure: new CreateProcedureUseCase(materialsRepo),
      updateProcedure: new UpdateProcedureUseCase(materialsRepo),
      deleteProcedure: new DeleteProcedureUseCase(materialsRepo),
      createSurgeon: new CreateSurgeonUseCase(materialsRepo),
      updateSurgeon: new UpdateSurgeonUseCase(materialsRepo),
      deleteSurgeon: new DeleteSurgeonUseCase(materialsRepo),
      createBeforeAfterCase: new CreateBeforeAfterCaseUseCase(materialsRepo),
      updateBeforeAfterCase: new UpdateBeforeAfterCaseUseCase(materialsRepo),
      deleteBeforeAfterCase: new DeleteBeforeAfterCaseUseCase(materialsRepo),
    };
  }
  return _services;
}
