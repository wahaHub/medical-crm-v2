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
}));
vi.mock('@medical-crm/infrastructure/storage', () => ({
  SupabaseStorageAdapter: vi.fn(() => ({})),
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

  it('returns all expected repositories', async () => {
    const { getServices } = await import('../composition-root');
    const services = getServices();
    expect(services).toHaveProperty('caseRepo');
    expect(services).toHaveProperty('documentRepo');
    expect(services).toHaveProperty('progressRepo');
    expect(services).toHaveProperty('hospitalRepo');
    expect(services).toHaveProperty('patientRepo');
    expect(services).toHaveProperty('storage');
  });

  it('returns all expected use cases', async () => {
    const { getServices } = await import('../composition-root');
    const services = getServices();
    expect(services).toHaveProperty('createCase');
    expect(services).toHaveProperty('listCases');
    expect(services).toHaveProperty('getCase');
    expect(services).toHaveProperty('getHospitalCaseDetail');
    expect(services).toHaveProperty('updateCase');
    expect(services).toHaveProperty('assignCase');
    expect(services).toHaveProperty('updateCaseStatus');
    expect(services).toHaveProperty('advanceCaseStage');
    expect(services).toHaveProperty('getCaseStats');
    expect(services).toHaveProperty('uploadDocument');
    expect(services).toHaveProperty('listDocuments');
    expect(services).toHaveProperty('deleteDocument');
    expect(services).toHaveProperty('getCaseProgress');
    expect(services).toHaveProperty('addCaseProgress');
  });
});
