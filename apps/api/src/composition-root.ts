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
} from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';
import { KeycloakAdminService, SupabaseHospitalSyncService, OpenAITranslationService } from '@medical-crm/infrastructure/services';

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
    };
  }
  return _services;
}
