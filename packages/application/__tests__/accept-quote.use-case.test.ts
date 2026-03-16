import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptQuoteUseCase } from '../src/use-cases/quotes/accept-quote.use-case.js';
import type { IQuoteRepository, ICHCRepository, ICaseRepository, TransactionRunner } from '@medical-crm/domain';
import { Quote, QuoteNumber, CaseHospitalContact, Case, CaseNumber } from '@medical-crm/domain';
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

// ——— Factories ———
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

function makeMockCHC(overrides: Partial<ConstructorParameters<typeof CaseHospitalContact>[0]> = {}): CaseHospitalContact {
  return new CaseHospitalContact({
    id: 'chc-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    subStatus: 'QUOTED',
    selectedByPatientAt: null,
    distributedAt: new Date(),
    firstReplyAt: new Date(),
    quoteId: 'quote-1',
    patientViewedQuoteAt: null,
    patientAcceptedAt: null,
    patientRejectedAt: null,
    reminderSentAt: null,
    removedAt: null,
    removedReason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeMockCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'John Doe',
    patientCountry: null,
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
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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

function createMockQuoteRepo(): IQuoteRepository {
  return {
    findById: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    nextQuoteNumber: vi.fn().mockResolvedValue('QT-20260316-0001'),
    rejectPendingByCaseExcept: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCHCRepo(): ICHCRepository {
  return {
    findById: vi.fn(),
    findByCaseAndHospital: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    rejectOthersByCaseExcept: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

function createMockTxRunner(): TransactionRunner {
  return {
    run: vi.fn().mockImplementation((fn) => fn('mock-tx')),
  };
}

describe('AcceptQuoteUseCase', () => {
  let useCase: AcceptQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCHCRepo: ICHCRepository;
  let mockCaseRepo: ICaseRepository;
  let mockTxRunner: TransactionRunner;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCHCRepo = createMockCHCRepo();
    mockCaseRepo = createMockCaseRepo();
    mockTxRunner = createMockTxRunner();
    useCase = new AcceptQuoteUseCase(mockQuoteRepo, mockCHCRepo, mockCaseRepo, mockTxRunner);
  });

  it('accepts quote, updates CHC, rejects others, and assigns case (happy path)', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC();
    const caseEntity = makeMockCase();

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);

    const result = await useCase.execute('quote-1', adminActor);

    // Quote accepted
    expect(result.status).toBe('ACCEPTED');
    expect(mockQuoteRepo.save).toHaveBeenCalledWith(quote, 'mock-tx');

    // CHC accepted
    expect(chc.subStatus).toBe('ACCEPTED');
    expect(chc.patientAcceptedAt).toBeTruthy();
    expect(mockCHCRepo.save).toHaveBeenCalledWith(chc, 'mock-tx');

    // Other CHCs rejected
    expect(mockCHCRepo.rejectOthersByCaseExcept).toHaveBeenCalledWith('case-1', 'chc-1', 'mock-tx');

    // Other pending quotes rejected
    expect(mockQuoteRepo.rejectPendingByCaseExcept).toHaveBeenCalledWith('case-1', 'quote-1', 'mock-tx');

    // Case assigned
    expect(caseEntity.assignmentStatus).toBe('ASSIGNED');
    expect(caseEntity.assignedHospitalId).toBe('hosp-1');
    expect(caseEntity.assignedAt).toBeTruthy();
    expect(mockCaseRepo.save).toHaveBeenCalledWith(caseEntity, 'mock-tx');
  });

  it('throws ForbiddenError for non-ADMIN', async () => {
    await expect(
      useCase.execute('quote-1', hospitalActor),
    ).rejects.toThrow('Only admins can accept quotes');

    // TransactionRunner should not have been called
    expect(mockTxRunner.run).not.toHaveBeenCalled();
  });

  it('throws NotFoundError if quote not found', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', adminActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });

  it('throws ConflictError if quote not PENDING', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ status: 'ACCEPTED' }),
    );

    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Quote is not in PENDING status');
  });

  it('throws ConflictError if quote is draft', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ isDraft: true }),
    );

    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Cannot accept a draft quote');
  });

  it('throws NotFoundError if CHC not found', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('CaseHospitalContact not found');
  });

  it('throws NotFoundError if case not found', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC();

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Case not found');
  });

  it('uses TransactionRunner.run for atomicity', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC();
    const caseEntity = makeMockCase();

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);

    await useCase.execute('quote-1', adminActor);

    expect(mockTxRunner.run).toHaveBeenCalledOnce();
    expect(mockTxRunner.run).toHaveBeenCalledWith(expect.any(Function));
  });

  it('passes the tx to all repository calls', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC();
    const caseEntity = makeMockCase();

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);

    await useCase.execute('quote-1', adminActor);

    // Verify tx was passed to each repository call
    expect(mockQuoteRepo.findById).toHaveBeenCalledWith('quote-1', 'mock-tx');
    expect(mockCHCRepo.findByCaseAndHospital).toHaveBeenCalledWith('case-1', 'hosp-1', 'mock-tx');
    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1', 'mock-tx');
  });
});
