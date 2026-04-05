import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPatientCasesUseCase } from '../src/use-cases/patient-dashboard/get-patient-cases.use-case.js';
import { GetPatientCaseDetailUseCase } from '../src/use-cases/patient-dashboard/get-patient-case-detail.use-case.js';
import { GetPatientConversationsUseCase } from '../src/use-cases/patient-dashboard/get-patient-conversations.use-case.js';
import { PatientAcceptQuoteUseCase } from '../src/use-cases/patient-dashboard/patient-accept-quote.use-case.js';
import { PatientRejectQuoteUseCase } from '../src/use-cases/patient-dashboard/patient-reject-quote.use-case.js';
import { SelectHospitalsUseCase } from '../src/use-cases/patient-dashboard/select-hospitals.use-case.js';
import { GetIntakeTemplateUseCase } from '../src/use-cases/patient-intake/get-intake-template.use-case.js';
import { SubmitIntakeUseCase } from '../src/use-cases/patient-intake/submit-intake.use-case.js';
import { SubmitPatientQCResponseUseCase } from '../src/use-cases/patient-dashboard/submit-patient-qc-response.use-case.js';
import { GetPatientQCResponseUseCase } from '../src/use-cases/patient-dashboard/get-patient-qc-response.use-case.js';
import type { ICaseRepository, IConversationRepository, IQuoteRepository, ICHCRepository, IQuestionCollectorRepository } from '@medical-crm/domain';
import { Case, CaseNumber, Conversation, Quote, QuoteNumber, CaseHospitalContact, QCResponse, QCTemplate } from '@medical-crm/domain';

// ——— Factories ———
function makeMockCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'John Doe',
    patientCountry: 'US',
    patientLanguage: 'en',
    assignedHospitalId: null,
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'PENDING_ASSIGNMENT',
    assignedAt: null,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    assignmentStatus: 'UNASSIGNED',
    treatmentStage: null,
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

function makeMockConversation(overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {}): Conversation {
  return new Conversation({
    id: 'conv-1',
    caseId: 'case-1',
    category: 'HOSPITAL_PATIENT',
    title: null,
    hospitalId: 'hospital-1',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function makeMockQuote(overrides: Partial<ConstructorParameters<typeof Quote>[0]> = {}): Quote {
  return new Quote({
    id: 'quote-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    quoteNumber: new QuoteNumber('QT-20260316-0001'),
    version: 1,
    status: 'PENDING',
    isDraft: false,
    totalAmount: '1000.00',
    currency: 'USD',
    validUntil: new Date('2026-04-01'),
    treatmentPlan: null,
    lineItems: null,
    notes: null,
    sentAt: new Date('2026-03-16'),
    createdBy: 'user-1',
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

// ——— Mock repositories ———
function makeMockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

function makeMockConversationRepo(): IConversationRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
  };
}

function makeMockQuoteRepo(): IQuoteRepository {
  return {
    findById: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn(),
    nextQuoteNumber: vi.fn(),
    rejectPendingByCaseExcept: vi.fn(),
  };
}

function makeMockCHCRepo(): ICHCRepository {
  return {
    findById: vi.fn(),
    findByCaseAndHospital: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn(),
    rejectOthersByCaseExcept: vi.fn(),
  };
}

// ——— Tests ———

describe('GetPatientCasesUseCase', () => {
  let caseRepo: ICaseRepository;
  let useCase: GetPatientCasesUseCase;

  beforeEach(() => {
    caseRepo = makeMockCaseRepo();
    useCase = new GetPatientCasesUseCase(caseRepo);
  });

  it('returns cases for patient', async () => {
    const cases = [makeMockCase(), makeMockCase({ id: 'case-2' })];
    vi.mocked(caseRepo.findByPatientId).mockResolvedValue(cases);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(caseRepo.findByPatientId).toHaveBeenCalledWith('patient-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('case-1');
  });

  it('returns empty array when no cases', async () => {
    vi.mocked(caseRepo.findByPatientId).mockResolvedValue([]);

    const result = await useCase.execute({ patientId: 'patient-999' });

    expect(result).toHaveLength(0);
  });
});

describe('GetPatientCaseDetailUseCase', () => {
  let caseRepo: ICaseRepository;
  let useCase: GetPatientCaseDetailUseCase;

  beforeEach(() => {
    caseRepo = makeMockCaseRepo();
    useCase = new GetPatientCaseDetailUseCase(caseRepo);
  });

  it('returns case detail for owner', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());

    const result = await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(result.id).toBe('case-1');
  });

  it('throws NotFoundError for non-existent case', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ caseId: 'case-999', patientId: 'patient-1' }))
      .rejects.toThrow('Case case-999 not found');
  });

  it('throws ForbiddenError when patient does not own case', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({ caseId: 'case-1', patientId: 'patient-1' }))
      .rejects.toThrow('Access denied');
  });
});

describe('GetPatientConversationsUseCase', () => {
  let convRepo: IConversationRepository;
  let useCase: GetPatientConversationsUseCase;

  beforeEach(() => {
    convRepo = makeMockConversationRepo();
    useCase = new GetPatientConversationsUseCase(convRepo);
  });

  it('returns conversations for patient', async () => {
    const conversations = [makeMockConversation(), makeMockConversation({ id: 'conv-2' })];
    vi.mocked(convRepo.findByPatientId).mockResolvedValue(conversations);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(convRepo.findByPatientId).toHaveBeenCalledWith('patient-1');
    expect(result).toHaveLength(2);
  });
});

describe('PatientAcceptQuoteUseCase', () => {
  let quoteRepo: IQuoteRepository;
  let caseRepo: ICaseRepository;
  let useCase: PatientAcceptQuoteUseCase;

  beforeEach(() => {
    quoteRepo = makeMockQuoteRepo();
    caseRepo = makeMockCaseRepo();
    useCase = new PatientAcceptQuoteUseCase(quoteRepo, caseRepo);
  });

  it('accepts a pending quote for own case', async () => {
    const quote = makeMockQuote();
    vi.mocked(quoteRepo.findById).mockResolvedValue(quote);
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(quoteRepo.save).mockResolvedValue(quote);

    await useCase.execute({ quoteId: 'quote-1', patientId: 'patient-1' });

    expect(quoteRepo.save).toHaveBeenCalled();
    expect(quote.status).toBe('ACCEPTED');
  });

  it('throws ForbiddenError if patient does not own case', async () => {
    vi.mocked(quoteRepo.findById).mockResolvedValue(makeMockQuote());
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({ quoteId: 'quote-1', patientId: 'patient-1' }))
      .rejects.toThrow('Access denied');
  });

  it('throws ConflictError if quote not PENDING', async () => {
    vi.mocked(quoteRepo.findById).mockResolvedValue(makeMockQuote({ status: 'ACCEPTED' }));
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());

    await expect(useCase.execute({ quoteId: 'quote-1', patientId: 'patient-1' }))
      .rejects.toThrow('not in PENDING');
  });

  it('throws NotFoundError for non-existent quote', async () => {
    vi.mocked(quoteRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ quoteId: 'quote-999', patientId: 'patient-1' }))
      .rejects.toThrow('Quote quote-999 not found');
  });
});

describe('PatientRejectQuoteUseCase', () => {
  let quoteRepo: IQuoteRepository;
  let caseRepo: ICaseRepository;
  let useCase: PatientRejectQuoteUseCase;

  beforeEach(() => {
    quoteRepo = makeMockQuoteRepo();
    caseRepo = makeMockCaseRepo();
    useCase = new PatientRejectQuoteUseCase(quoteRepo, caseRepo);
  });

  it('rejects a pending quote for own case', async () => {
    const quote = makeMockQuote();
    vi.mocked(quoteRepo.findById).mockResolvedValue(quote);
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(quoteRepo.save).mockResolvedValue(quote);

    await useCase.execute({ quoteId: 'quote-1', patientId: 'patient-1' });

    expect(quote.status).toBe('REJECTED');
  });

  it('throws ForbiddenError if patient does not own case', async () => {
    vi.mocked(quoteRepo.findById).mockResolvedValue(makeMockQuote());
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({ quoteId: 'quote-1', patientId: 'patient-1' }))
      .rejects.toThrow('Access denied');
  });
});

describe('SelectHospitalsUseCase', () => {
  let caseRepo: ICaseRepository;
  let chcRepo: ICHCRepository;
  let convRepo: IConversationRepository;
  let useCase: SelectHospitalsUseCase;

  beforeEach(() => {
    caseRepo = makeMockCaseRepo();
    chcRepo = makeMockCHCRepo();
    convRepo = makeMockConversationRepo();
    useCase = new SelectHospitalsUseCase(caseRepo, chcRepo, convRepo);
  });

  it('throws ForbiddenError if patient does not own case', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['hosp-1'],
      patientId: 'patient-1',
    })).rejects.toThrow('Access denied');
  });

  it('creates CHC and conversation for each selected hospital', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(chcRepo.findByCaseAndHospital).mockResolvedValue(null);
    vi.mocked(chcRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(convRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    const result = await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['hosp-1', 'hosp-2'],
      patientId: 'patient-1',
    });

    expect(result).toHaveLength(2);
    expect(chcRepo.save).toHaveBeenCalledTimes(2);
    expect(convRepo.save).toHaveBeenCalledTimes(2);
  });

  it('persists a custom hospital request onto the case structured data', async () => {
    const baseCase = makeMockCase();
    vi.mocked(caseRepo.findById).mockResolvedValue(baseCase);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: [],
      customHospitalRequest: 'Ruijin Hospital',
      patientId: 'patient-1',
    });

    expect(caseRepo.save).toHaveBeenCalledTimes(1);
    const savedCase = vi.mocked(caseRepo.save).mock.calls[0]?.[0];
    expect(savedCase?.structuredData).toMatchObject({
      patientHospitalSelection: {
        customHospitalRequest: 'Ruijin Hospital',
      },
    });
    expect(chcRepo.save).not.toHaveBeenCalled();
    expect(convRepo.save).not.toHaveBeenCalled();
  });

  it('resubmitting without customHospitalRequest preserves the existing value', async () => {
    const baseCase = makeMockCase({
      structuredData: {
        patientHospitalSelection: {
          customHospitalRequest: 'Ruijin Hospital',
        },
      },
    });
    vi.mocked(caseRepo.findById).mockResolvedValue(baseCase);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: [],
      patientId: 'patient-1',
      // customHospitalRequest is intentionally omitted (undefined)
    });

    expect(caseRepo.save).toHaveBeenCalledTimes(1);
    const savedCase = vi.mocked(caseRepo.save).mock.calls[0]?.[0];
    expect(savedCase?.structuredData).toMatchObject({
      patientHospitalSelection: {
        customHospitalRequest: 'Ruijin Hospital',
      },
    });
  });

  it('skips hospital if CHC already exists', async () => {
    const existingCHC = new CaseHospitalContact({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date(),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(chcRepo.findByCaseAndHospital).mockResolvedValue(existingCHC);

    const result = await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['hosp-1'],
      patientId: 'patient-1',
    });

    expect(result).toHaveLength(1);
    expect(chcRepo.save).not.toHaveBeenCalled();
    expect(convRepo.save).not.toHaveBeenCalled();
  });

  it('soft-removes previously active hospitals that are no longer selected', async () => {
    const activeHospital = new CaseHospitalContact({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: new Date('2026-04-04T00:00:00.000Z'),
      distributedAt: new Date('2026-04-04T00:00:00.000Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    });

    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(chcRepo.findByCaseId).mockResolvedValue([activeHospital]);
    vi.mocked(chcRepo.findByCaseAndHospital).mockResolvedValue(null);
    vi.mocked(chcRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(convRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: [],
      patientId: 'patient-1',
    });

    expect(chcRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'chc-1',
      removedAt: expect.any(Date),
      removedReason: 'PATIENT_SELECTION_REPLACED',
    }));
  });

  it('restores a previously removed hospital when the patient selects it again', async () => {
    const removedHospital = new CaseHospitalContact({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'REMOVED',
      selectedByPatientAt: new Date('2026-04-01T00:00:00.000Z'),
      distributedAt: new Date('2026-04-01T00:00:00.000Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: new Date('2026-04-02T00:00:00.000Z'),
      removedReason: 'PATIENT_SELECTION_REPLACED',
      version: 1,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    });

    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(chcRepo.findByCaseId).mockResolvedValue([removedHospital]);
    vi.mocked(chcRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['hosp-1'],
      patientId: 'patient-1',
    });

    expect(chcRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'chc-1',
      subStatus: 'DISTRIBUTED',
      removedAt: null,
      removedReason: null,
    }));
    expect(convRepo.save).not.toHaveBeenCalled();
  });

  it('returns only currently active contacts, not soft-removed ones', async () => {
    const activeHospital = new CaseHospitalContact({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: new Date('2026-04-04T00:00:00.000Z'),
      distributedAt: new Date('2026-04-04T00:00:00.000Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    });

    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    // Two existing active contacts: hosp-1 and hosp-2
    const deselectedHospital = new CaseHospitalContact({
      id: 'chc-2',
      caseId: 'case-1',
      hospitalId: 'hosp-2',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: new Date('2026-04-04T00:00:00.000Z'),
      distributedAt: new Date('2026-04-04T00:00:00.000Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    });
    vi.mocked(chcRepo.findByCaseId).mockResolvedValue([activeHospital, deselectedHospital]);
    vi.mocked(chcRepo.findByCaseAndHospital).mockResolvedValue(null);
    vi.mocked(chcRepo.save).mockImplementation(async (entity) => entity);
    vi.mocked(caseRepo.save).mockImplementation(async (entity) => entity);

    // Patient resubmits with only hosp-1; hosp-2 should be soft-removed and not in result
    const result = await useCase.execute({
      caseId: 'case-1',
      hospitalIds: ['hosp-1'],
      patientId: 'patient-1',
    });

    // Only hosp-1 should be returned; hosp-2 is removed and excluded
    expect(result).toHaveLength(1);
    expect(result[0]!.hospitalId).toBe('hosp-1');
    // hosp-2 was soft-removed
    expect(chcRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'chc-2',
      removedReason: 'PATIENT_SELECTION_REPLACED',
    }));
  });
});

describe('GetIntakeTemplateUseCase', () => {
  it('returns a stub template', async () => {
    const useCase = new GetIntakeTemplateUseCase();
    const result = await useCase.execute({ caseId: 'case-1' });

    expect(result.caseId).toBe('case-1');
    expect(result.questions).toBeInstanceOf(Array);
    expect(result.questions.length).toBeGreaterThan(0);
  });
});

describe('SubmitIntakeUseCase', () => {
  it('executes without error (stub)', async () => {
    const useCase = new SubmitIntakeUseCase();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      responses: [{ questionId: 'q1', answer: 'test answer' }],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[STUB] Intake submitted'),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });
});

// ——— QC response helpers ———

function makeMockQCTemplate(overrides: Partial<ConstructorParameters<typeof QCTemplate>[0]> = {}): QCTemplate {
  return new QCTemplate({
    id: 'template-1',
    templateName: 'Default Template',
    category: 'DEFAULT',
    procedureTypes: [],
    questions: [],
    version: 1,
    isActive: true,
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeMockQCResponse(overrides: Partial<ConstructorParameters<typeof QCResponse>[0]> = {}): QCResponse {
  return new QCResponse({
    id: 'qcr-1',
    caseId: 'case-1',
    templateId: 'template-1',
    userId: 'patient-1',
    responses: { q1: 'answer' },
    extractedData: null,
    riskFlags: [],
    completionStatus: 'COMPLETED',
    submittedAt: new Date('2026-04-05'),
    createdAt: new Date('2026-04-05'),
    updatedAt: new Date('2026-04-05'),
    ...overrides,
  });
}

function makeMockQCRepo(): IQuestionCollectorRepository {
  return {
    findTemplateById: vi.fn(),
    findAllTemplates: vi.fn(),
    findActiveTemplateByCategory: vi.fn(),
    saveTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    findResponseById: vi.fn(),
    findResponseByCaseId: vi.fn(),
    findAllResponses: vi.fn(),
    saveResponse: vi.fn(),
    findCustomization: vi.fn(),
    saveCustomization: vi.fn(),
  };
}

// ——— SubmitPatientQCResponseUseCase tests ———

describe('SubmitPatientQCResponseUseCase', () => {
  let caseRepo: ICaseRepository;
  let qcRepo: IQuestionCollectorRepository;
  let useCase: SubmitPatientQCResponseUseCase;

  beforeEach(() => {
    caseRepo = makeMockCaseRepo();
    qcRepo = makeMockQCRepo();
    useCase = new SubmitPatientQCResponseUseCase(qcRepo, caseRepo);
  });

  it('patient can submit response for their own case', async () => {
    const caseEntity = makeMockCase();
    vi.mocked(caseRepo.findById).mockResolvedValue(caseEntity);
    vi.mocked(qcRepo.findTemplateById).mockResolvedValue(makeMockQCTemplate());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(null);
    const savedResponse = makeMockQCResponse();
    vi.mocked(qcRepo.saveResponse).mockResolvedValue(savedResponse);
    vi.mocked(caseRepo.save).mockResolvedValue(caseEntity);

    const result = await useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      templateId: 'template-1',
      responses: { q1: 'my answer' },
    });

    expect(qcRepo.saveResponse).toHaveBeenCalled();
    expect(caseRepo.save).toHaveBeenCalled();
    expect(result.id).toBe('qcr-1');
    expect(result.caseId).toBe('case-1');
  });

  it('marks case medicalFormStatus as SUBMITTED after submit', async () => {
    const caseEntity = makeMockCase();
    vi.mocked(caseRepo.findById).mockResolvedValue(caseEntity);
    vi.mocked(qcRepo.findTemplateById).mockResolvedValue(makeMockQCTemplate());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(null);
    const savedResponse = makeMockQCResponse();
    vi.mocked(qcRepo.saveResponse).mockResolvedValue(savedResponse);
    vi.mocked(caseRepo.save).mockResolvedValue(caseEntity);

    await useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      templateId: 'template-1',
      responses: { q1: 'my answer' },
    });

    const savedCase = vi.mocked(caseRepo.save).mock.calls[0]?.[0];
    const selection = savedCase?.structuredData?.['patientHospitalSelection'] as Record<string, unknown>;
    expect(selection?.['medicalFormStatus']).toBe('SUBMITTED');
    expect(selection?.['medicalFormSubmittedAt']).toBeDefined();
    expect(selection?.['medicalFormResponseId']).toBe('qcr-1');
  });

  it('throws ConflictError when medical form is already SUBMITTED', async () => {
    const caseEntity = makeMockCase({
      structuredData: {
        patientHospitalSelection: {
          medicalFormStatus: 'SUBMITTED',
          medicalFormSubmittedAt: '2026-04-01T00:00:00.000Z',
          medicalFormResponseId: 'qcr-existing',
        },
      },
    });
    vi.mocked(caseRepo.findById).mockResolvedValue(caseEntity);
    vi.mocked(qcRepo.findTemplateById).mockResolvedValue(makeMockQCTemplate());

    await expect(useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      templateId: 'template-1',
      responses: { q1: 'updated answer' },
    })).rejects.toThrow('Medical form has already been submitted for this case');
  });

  it('throws NotFoundError when templateId does not exist', async () => {
    const caseEntity = makeMockCase();
    vi.mocked(caseRepo.findById).mockResolvedValue(caseEntity);
    vi.mocked(qcRepo.findTemplateById).mockResolvedValue(null);

    await expect(useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      templateId: 'nonexistent-template',
      responses: {},
    })).rejects.toThrow('Template nonexistent-template not found');
  });

  it('access is forbidden for other patients\' cases on submit', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({
      caseId: 'case-1',
      patientId: 'patient-1',
      templateId: 'template-1',
      responses: { q1: 'my answer' },
    })).rejects.toThrow('Access denied');
  });

  it('throws NotFoundError when case does not exist', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({
      caseId: 'case-999',
      patientId: 'patient-1',
      templateId: 'template-1',
      responses: {},
    })).rejects.toThrow('Case case-999 not found');
  });
});

// ——— GetPatientQCResponseUseCase tests ———

describe('GetPatientQCResponseUseCase', () => {
  let caseRepo: ICaseRepository;
  let qcRepo: IQuestionCollectorRepository;
  let useCase: GetPatientQCResponseUseCase;

  beforeEach(() => {
    caseRepo = makeMockCaseRepo();
    qcRepo = makeMockQCRepo();
    useCase = new GetPatientQCResponseUseCase(qcRepo, caseRepo);
  });

  it('patient can fetch the submitted response for their own case', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(makeMockQCResponse());

    const result = await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('qcr-1');
    expect(result!.caseId).toBe('case-1');
    expect(result!.completionStatus).toBe('COMPLETED');
  });

  it('response retrieval after submit returns submitted content', async () => {
    const submittedResponse = makeMockQCResponse({
      responses: { q1: 'my submitted answer' },
      completionStatus: 'COMPLETED',
      submittedAt: new Date('2026-04-05'),
    });
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(submittedResponse);

    const result = await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(result!.responses).toEqual({ q1: 'my submitted answer' });
    expect(result!.submittedAt).toBeDefined();
    expect(result!.completionStatus).toBe('COMPLETED');
  });

  it('returns null when no response exists yet', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(null);

    const result = await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(result).toBeNull();
  });

  it('access is forbidden for other patients\' cases on get', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase({ patientId: 'other-patient' }));

    await expect(useCase.execute({ caseId: 'case-1', patientId: 'patient-1' }))
      .rejects.toThrow('Access denied');
  });

  it('does not expose admin-only fields (extractedData, riskFlags, translations, userId)', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(makeMockCase());
    vi.mocked(qcRepo.findResponseByCaseId).mockResolvedValue(
      makeMockQCResponse({ riskFlags: ['HIGH_RISK'], extractedData: { secret: true } }),
    );

    const result = await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>)['riskFlags']).toBeUndefined();
    expect((result as Record<string, unknown>)['extractedData']).toBeUndefined();
    expect((result as Record<string, unknown>)['translations']).toBeUndefined();
    expect((result as Record<string, unknown>)['userId']).toBeUndefined();
  });

  it('throws NotFoundError when case does not exist', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ caseId: 'case-999', patientId: 'patient-1' }))
      .rejects.toThrow('Case case-999 not found');
  });
});
