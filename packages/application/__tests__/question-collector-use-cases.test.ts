import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTemplateUseCase } from '../src/use-cases/question-collector/create-template.use-case.js';
import { UpdateTemplateUseCase } from '../src/use-cases/question-collector/update-template.use-case.js';
import { ListTemplatesUseCase } from '../src/use-cases/question-collector/list-templates.use-case.js';
import { GetTemplateUseCase } from '../src/use-cases/question-collector/get-template.use-case.js';
import { SubmitResponseUseCase } from '../src/use-cases/question-collector/submit-response.use-case.js';
import { SaveResponseDraftUseCase } from '../src/use-cases/question-collector/save-response-draft.use-case.js';
import { GetResponseUseCase } from '../src/use-cases/question-collector/get-response.use-case.js';
import { ListResponsesUseCase } from '../src/use-cases/question-collector/list-responses.use-case.js';
import { CustomizeQuestionsUseCase } from '../src/use-cases/question-collector/customize-questions.use-case.js';
import { GetCustomizationUseCase } from '../src/use-cases/question-collector/get-customization.use-case.js';
import { QCTemplate, QCResponse, QCCustomization, Case, CaseNumber } from '@medical-crm/domain';
import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const otherHospitalActor: Actor = {
  userId: 'hospital-user-2',
  email: 'other@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-2',
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const otherPatientActor: Actor = {
  userId: 'patient-2',
  email: 'other-patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

// ——— Factories ———
function makeTemplate(overrides: Partial<ConstructorParameters<typeof QCTemplate>[0]> = {}): QCTemplate {
  return new QCTemplate({
    id: 'tpl-1',
    templateName: 'Pre-Op Questionnaire',
    category: 'PRE_OP',
    procedureTypes: ['rhinoplasty'],
    questions: [{ id: 'q1', text: 'Allergies?' }],
    version: 1,
    isActive: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeResponse(overrides: Partial<ConstructorParameters<typeof QCResponse>[0]> = {}): QCResponse {
  return new QCResponse({
    id: 'resp-1',
    caseId: 'case-1',
    templateId: 'tpl-1',
    userId: 'patient-1',
    responses: { q1: 'No' },
    extractedData: null,
    riskFlags: [],
    completionStatus: 'NOT_STARTED',
    submittedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeCustomization(overrides: Partial<ConstructorParameters<typeof QCCustomization>[0]> = {}): QCCustomization {
  return new QCCustomization({
    id: 'cust-1',
    templateId: 'tpl-1',
    hospitalId: 'hosp-1',
    customizedQuestions: [{ id: 'q1', text: 'Custom Q' }],
    customizedBy: 'hospital-user-1',
    customizedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    assignedHospitalId: 'hosp-1',
    patientName: 'Test Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'IN_TREATMENT',
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    assignmentStatus: 'ASSIGNED',
    treatmentStage: 'IN_TREATMENT',
    conditionSummary: null,
    structuredData: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
    ...overrides,
  });
}

// ——— Mock TranslationTaskService ———
function mockTranslationTaskService() {
  return { enqueue: vi.fn().mockResolvedValue(undefined) };
}

// ——— Mock repos ———
function mockQCRepo(): IQuestionCollectorRepository {
  return {
    findTemplateById: vi.fn(),
    findAllTemplates: vi.fn(),
    saveTemplate: vi.fn(),
    findResponseById: vi.fn(),
    findResponseByCaseId: vi.fn(),
    findAllResponses: vi.fn(),
    saveResponse: vi.fn(),
    findCustomization: vi.fn(),
    saveCustomization: vi.fn(),
  };
}

function mockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

// ============================================================================
// CreateTemplateUseCase
// ============================================================================
describe('CreateTemplateUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let translationTaskService: ReturnType<typeof mockTranslationTaskService>;
  let uc: CreateTemplateUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    translationTaskService = mockTranslationTaskService();
    uc = new CreateTemplateUseCase(qcRepo, translationTaskService as any);
  });

  it('creates a template for admin', async () => {
    (qcRepo.saveTemplate as ReturnType<typeof vi.fn>).mockImplementation((e: QCTemplate) => Promise.resolve(e));
    const result = await uc.execute({
      templateName: 'Test',
      category: 'PRE_OP',
      questions: [{ id: 'q1' }],
    }, adminActor);
    expect(result.templateName).toBe('Test');
    expect(result.category).toBe('PRE_OP');
    expect(result.isActive).toBe(true);
  });

  it('rejects non-admin', async () => {
    await expect(uc.execute({ templateName: 'T', category: 'C', questions: [] }, patientActor))
      .rejects.toThrow('Only admins can create templates');
  });

  it('rejects hospital', async () => {
    await expect(uc.execute({ templateName: 'T', category: 'C', questions: [] }, hospitalActor))
      .rejects.toThrow('Only admins can create templates');
  });
});

// ============================================================================
// UpdateTemplateUseCase
// ============================================================================
describe('UpdateTemplateUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let translationTaskService: ReturnType<typeof mockTranslationTaskService>;
  let uc: UpdateTemplateUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    translationTaskService = mockTranslationTaskService();
    uc = new UpdateTemplateUseCase(qcRepo, translationTaskService as any);
  });

  it('updates a template for admin', async () => {
    const tpl = makeTemplate();
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);
    (qcRepo.saveTemplate as ReturnType<typeof vi.fn>).mockImplementation((e: QCTemplate) => Promise.resolve(e));
    const result = await uc.execute('tpl-1', { templateName: 'Updated' }, adminActor);
    expect(result.templateName).toBe('Updated');
  });

  it('throws NotFound for missing template', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('tpl-999', { templateName: 'X' }, adminActor))
      .rejects.toThrow('Template tpl-999 not found');
  });

  it('rejects non-admin', async () => {
    await expect(uc.execute('tpl-1', { templateName: 'X' }, patientActor))
      .rejects.toThrow('Only admins can update templates');
  });
});

// ============================================================================
// ListTemplatesUseCase
// ============================================================================
describe('ListTemplatesUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let uc: ListTemplatesUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    uc = new ListTemplatesUseCase(qcRepo);
  });

  it('admin sees all templates (no isActive filter forced)', async () => {
    (qcRepo.findAllTemplates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    await uc.execute({ page: 1, limit: 20 }, adminActor);
    expect(qcRepo.findAllTemplates).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('patient only sees active templates', async () => {
    (qcRepo.findAllTemplates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    await uc.execute({ page: 1, limit: 20 }, patientActor);
    expect(qcRepo.findAllTemplates).toHaveBeenCalledWith({ page: 1, limit: 20, isActive: true });
  });

  it('hospital only sees active templates', async () => {
    (qcRepo.findAllTemplates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    await uc.execute({ page: 1, limit: 20 }, hospitalActor);
    expect(qcRepo.findAllTemplates).toHaveBeenCalledWith({ page: 1, limit: 20, isActive: true });
  });
});

// ============================================================================
// GetTemplateUseCase
// ============================================================================
describe('GetTemplateUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: GetTemplateUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    caseRepo = mockCaseRepo();
    uc = new GetTemplateUseCase(qcRepo, caseRepo);
  });

  it('returns template for admin', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    const result = await uc.execute('tpl-1', adminActor);
    expect(result.template.id).toBe('tpl-1');
    expect(result.customization).toBeUndefined();
  });

  it('throws NotFound for missing template', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('tpl-999', adminActor)).rejects.toThrow('Template tpl-999 not found');
  });

  it('resolves customization for patient with assigned case', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findCustomization as ReturnType<typeof vi.fn>).mockResolvedValue(makeCustomization());

    const result = await uc.execute('tpl-1', patientActor, 'case-1');
    expect(result.customization).toBeDefined();
    expect(result.customization!.hospitalId).toBe('hosp-1');
  });

  it('throws ForbiddenError when patient accesses other patient case', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase({ patientId: 'other-patient' }));

    await expect(uc.execute('tpl-1', patientActor, 'case-1'))
      .rejects.toThrow('Access denied to this case');
  });

  it('no customization when case is unassigned', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase({ assignmentStatus: 'UNASSIGNED', assignedHospitalId: null }));

    const result = await uc.execute('tpl-1', patientActor, 'case-1');
    expect(result.customization).toBeUndefined();
  });

  it('no customization when no caseId provided', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    const result = await uc.execute('tpl-1', patientActor);
    expect(result.customization).toBeUndefined();
  });
});

// ============================================================================
// SubmitResponseUseCase
// ============================================================================
describe('SubmitResponseUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let translationTaskService: ReturnType<typeof mockTranslationTaskService>;
  let uc: SubmitResponseUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    caseRepo = mockCaseRepo();
    translationTaskService = mockTranslationTaskService();
    uc = new SubmitResponseUseCase(qcRepo, caseRepo, translationTaskService as any);
  });

  it('creates new response on submit', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (qcRepo.saveResponse as ReturnType<typeof vi.fn>).mockImplementation((e: QCResponse) => Promise.resolve(e));

    const result = await uc.execute('case-1', {
      templateId: 'tpl-1',
      responses: { q1: 'Yes' },
      riskFlags: ['FLAG_A'],
    }, patientActor);

    expect(result.completionStatus).toBe('COMPLETED');
    expect(result.riskFlags).toEqual(['FLAG_A']);
    expect(result.submittedAt).not.toBeNull();
  });

  it('updates existing response on submit', async () => {
    const existing = makeResponse({ completionStatus: 'IN_PROGRESS' });
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (qcRepo.saveResponse as ReturnType<typeof vi.fn>).mockImplementation((e: QCResponse) => Promise.resolve(e));

    const result = await uc.execute('case-1', {
      templateId: 'tpl-1',
      responses: { q1: 'Final' },
    }, patientActor);

    expect(result.completionStatus).toBe('COMPLETED');
  });

  it('rejects non-patient', async () => {
    await expect(uc.execute('case-1', { templateId: 'tpl-1', responses: {} }, adminActor))
      .rejects.toThrow('Only patients can submit questionnaire responses');
  });

  it('rejects if case belongs to another patient', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', { templateId: 'tpl-1', responses: {} }, otherPatientActor))
      .rejects.toThrow('Patient can only submit responses for their own cases');
  });

  it('throws NotFound for missing case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-999', { templateId: 'tpl-1', responses: {} }, patientActor))
      .rejects.toThrow('Case case-999 not found');
  });

  it('throws NotFound for missing template', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-1', { templateId: 'tpl-999', responses: {} }, patientActor))
      .rejects.toThrow('Template tpl-999 not found');
  });
});

// ============================================================================
// SaveResponseDraftUseCase
// ============================================================================
describe('SaveResponseDraftUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: SaveResponseDraftUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    caseRepo = mockCaseRepo();
    uc = new SaveResponseDraftUseCase(qcRepo, caseRepo);
  });

  it('creates draft response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (qcRepo.saveResponse as ReturnType<typeof vi.fn>).mockImplementation((e: QCResponse) => Promise.resolve(e));

    const result = await uc.execute('case-1', {
      templateId: 'tpl-1',
      responses: { q1: 'partial' },
    }, patientActor);

    expect(result.completionStatus).toBe('IN_PROGRESS');
    expect(result.submittedAt).toBeNull();
  });

  it('updates existing draft', async () => {
    const existing = makeResponse({ completionStatus: 'IN_PROGRESS' });
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (qcRepo.saveResponse as ReturnType<typeof vi.fn>).mockImplementation((e: QCResponse) => Promise.resolve(e));

    const result = await uc.execute('case-1', {
      templateId: 'tpl-1',
      responses: { q1: 'updated partial' },
    }, patientActor);

    expect(result.completionStatus).toBe('IN_PROGRESS');
  });

  it('rejects non-patient', async () => {
    await expect(uc.execute('case-1', { templateId: 'tpl-1', responses: {} }, adminActor))
      .rejects.toThrow('Only patients can save questionnaire drafts');
  });

  it('rejects other patient', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', { templateId: 'tpl-1', responses: {} }, otherPatientActor))
      .rejects.toThrow('Patient can only save drafts for their own cases');
  });
});

// ============================================================================
// GetResponseUseCase
// ============================================================================
describe('GetResponseUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: GetResponseUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    caseRepo = mockCaseRepo();
    uc = new GetResponseUseCase(qcRepo, caseRepo);
  });

  it('admin can get any response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse());
    const result = await uc.execute('case-1', adminActor);
    expect(result).not.toBeNull();
    expect(result!.caseId).toBe('case-1');
  });

  it('patient can get own case response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse());
    const result = await uc.execute('case-1', patientActor);
    expect(result).not.toBeNull();
  });

  it('patient cannot get other case response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherPatientActor))
      .rejects.toThrow('Patient can only access their own case responses');
  });

  it('hospital can get assigned case response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse());
    const result = await uc.execute('case-1', hospitalActor);
    expect(result).not.toBeNull();
  });

  it('hospital cannot get unassigned case response', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherHospitalActor))
      .rejects.toThrow('Hospital can only access responses for assigned cases');
  });

  it('returns null when no response exists', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (qcRepo.findResponseByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await uc.execute('case-1', adminActor);
    expect(result).toBeNull();
  });

  it('throws NotFound for missing case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-999', adminActor)).rejects.toThrow('Case case-999 not found');
  });
});

// ============================================================================
// ListResponsesUseCase
// ============================================================================
describe('ListResponsesUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let uc: ListResponsesUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    uc = new ListResponsesUseCase(qcRepo);
  });

  it('admin can list responses', async () => {
    (qcRepo.findAllResponses as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.total).toBe(0);
  });

  it('rejects patient', async () => {
    await expect(uc.execute({ page: 1, limit: 20 }, patientActor))
      .rejects.toThrow('Only admins can list all responses');
  });

  it('rejects hospital', async () => {
    await expect(uc.execute({ page: 1, limit: 20 }, hospitalActor))
      .rejects.toThrow('Only admins can list all responses');
  });

  it('passes hasRiskFlags filter', async () => {
    (qcRepo.findAllResponses as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    await uc.execute({ page: 1, limit: 20, hasRiskFlags: true }, adminActor);
    expect(qcRepo.findAllResponses).toHaveBeenCalledWith({ page: 1, limit: 20, hasRiskFlags: true });
  });
});

// ============================================================================
// CustomizeQuestionsUseCase
// ============================================================================
describe('CustomizeQuestionsUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let uc: CustomizeQuestionsUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    uc = new CustomizeQuestionsUseCase(qcRepo);
  });

  it('hospital creates new customization', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findCustomization as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (qcRepo.saveCustomization as ReturnType<typeof vi.fn>).mockImplementation((e: QCCustomization) => Promise.resolve(e));

    const result = await uc.execute('tpl-1', {
      customizedQuestions: [{ id: 'q1', text: 'Custom' }],
    }, hospitalActor);

    expect(result.templateId).toBe('tpl-1');
    expect(result.hospitalId).toBe('hosp-1');
  });

  it('hospital updates existing customization', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findCustomization as ReturnType<typeof vi.fn>).mockResolvedValue(makeCustomization());
    (qcRepo.saveCustomization as ReturnType<typeof vi.fn>).mockImplementation((e: QCCustomization) => Promise.resolve(e));

    const result = await uc.execute('tpl-1', {
      customizedQuestions: [{ id: 'q2', text: 'New custom' }],
    }, hospitalActor);

    expect(result.customizedBy).toBe('hospital-user-1');
  });

  it('rejects admin', async () => {
    await expect(uc.execute('tpl-1', { customizedQuestions: [] }, adminActor))
      .rejects.toThrow('Only hospital users can customize questions');
  });

  it('rejects patient', async () => {
    await expect(uc.execute('tpl-1', { customizedQuestions: [] }, patientActor))
      .rejects.toThrow('Only hospital users can customize questions');
  });

  it('rejects hospital without hospitalId', async () => {
    const noHospital: Actor = { ...hospitalActor, hospitalId: null };
    await expect(uc.execute('tpl-1', { customizedQuestions: [] }, noHospital))
      .rejects.toThrow('Hospital user must be associated with a hospital');
  });

  it('throws NotFound for missing template', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('tpl-999', { customizedQuestions: [] }, hospitalActor))
      .rejects.toThrow('Template tpl-999 not found');
  });
});

// ============================================================================
// GetCustomizationUseCase
// ============================================================================
describe('GetCustomizationUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let uc: GetCustomizationUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    uc = new GetCustomizationUseCase(qcRepo);
  });

  it('hospital gets own customization', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findCustomization as ReturnType<typeof vi.fn>).mockResolvedValue(makeCustomization());
    const result = await uc.execute('tpl-1', hospitalActor);
    expect(result).not.toBeNull();
    expect(result!.hospitalId).toBe('hosp-1');
  });

  it('returns null when no customization', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());
    (qcRepo.findCustomization as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await uc.execute('tpl-1', hospitalActor);
    expect(result).toBeNull();
  });

  it('rejects admin', async () => {
    await expect(uc.execute('tpl-1', adminActor))
      .rejects.toThrow('Only hospital users can view customizations');
  });

  it('rejects patient', async () => {
    await expect(uc.execute('tpl-1', patientActor))
      .rejects.toThrow('Only hospital users can view customizations');
  });

  it('throws NotFound for missing template', async () => {
    (qcRepo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('tpl-999', hospitalActor))
      .rejects.toThrow('Template tpl-999 not found');
  });
});
