import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  DrizzleTransactionRunner: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/storage', () => ({
  SupabaseStorageAdapter: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-main/materials', () => ({
  SupabaseMaterialsRepository: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/services', () => ({
  KeycloakAdminService: vi.fn(() => ({})),
  SupabaseHospitalSyncService: vi.fn(() => ({})),
  OpenAITranslationService: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/domain', () => ({
  CaseAssignmentService: vi.fn(() => ({})),
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
  });
});
