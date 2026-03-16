import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateQuoteUseCase } from '../src/use-cases/quotes/create-quote.use-case.js';
import { UpdateQuoteUseCase } from '../src/use-cases/quotes/update-quote.use-case.js';
import { SendQuoteUseCase } from '../src/use-cases/quotes/send-quote.use-case.js';
import { ListQuotesUseCase } from '../src/use-cases/quotes/list-quotes.use-case.js';
import { GetQuoteUseCase } from '../src/use-cases/quotes/get-quote.use-case.js';
import { CompareQuotesUseCase } from '../src/use-cases/quotes/compare-quotes.use-case.js';
import { ResendQuoteUseCase } from '../src/use-cases/quotes/resend-quote.use-case.js';
import { ListCaseHospitalContactsUseCase } from '../src/use-cases/quotes/list-case-hospital-contacts.use-case.js';
import type { IQuoteRepository, ICHCRepository, ICaseRepository } from '@medical-crm/domain';
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
function makeMockQuote(overrides: Partial<ConstructorParameters<typeof Quote>[0]> = {}): Quote {
  return new Quote({
    id: 'quote-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    quoteNumber: new QuoteNumber('QT-20260316-0001'),
    version: 1,
    status: 'PENDING',
    isDraft: true,
    totalAmount: '5000.00',
    currency: 'USD',
    validUntil: new Date('2026-04-16'),
    treatmentPlan: 'Initial plan',
    lineItems: [{ item: 'Procedure A', amount: '5000.00' }],
    notes: 'Some notes',
    sentAt: null,
    createdBy: 'hospital-user-1',
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
    subStatus: 'DISTRIBUTED',
    selectedByPatientAt: null,
    distributedAt: new Date('2026-01-01'),
    firstReplyAt: null,
    quoteId: null,
    patientViewedQuoteAt: null,
    patientAcceptedAt: null,
    patientRejectedAt: null,
    reminderSentAt: null,
    removedAt: null,
    removedReason: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
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
    rejectPendingByCaseExcept: vi.fn(),
  };
}

function createMockCHCRepo(): ICHCRepository {
  return {
    findById: vi.fn(),
    findByCaseAndHospital: vi.fn(),
    findByCaseId: vi.fn(),
    findByHospitalId: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    rejectOthersByCaseExcept: vi.fn(),
  };
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

function createMockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn().mockResolvedValue(makeCase()),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

// =============== CreateQuoteUseCase ===============
describe('CreateQuoteUseCase', () => {
  let useCase: CreateQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    useCase = new CreateQuoteUseCase(mockQuoteRepo);
  });

  it('creates a draft quote with correct fields', async () => {
    const result = await useCase.execute(
      {
        caseId: 'case-1',
        hospitalId: 'hosp-1',
        totalAmount: '5000.00',
        currency: 'USD',
        validUntil: '2026-04-16T00:00:00.000Z',
      },
      hospitalActor,
    );

    expect(mockQuoteRepo.nextQuoteNumber).toHaveBeenCalledOnce();
    expect(mockQuoteRepo.save).toHaveBeenCalledOnce();
    expect(result.isDraft).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.quoteNumber).toBe('QT-20260316-0001');
    expect(result.totalAmount).toBe('5000.00');
    expect(result.currency).toBe('USD');
    expect(result.caseId).toBe('case-1');
    expect(result.hospitalId).toBe('hosp-1');
    expect(result.createdBy).toBe('hospital-user-1');
    expect(result.sentAt).toBeNull();
  });

  it('defaults currency to USD when not provided', async () => {
    const result = await useCase.execute(
      {
        caseId: 'case-1',
        hospitalId: 'hosp-1',
        totalAmount: '3000.00',
        validUntil: '2026-04-16T00:00:00.000Z',
      },
      hospitalActor,
    );

    expect(result.currency).toBe('USD');
  });

  it('sets optional fields (treatmentPlan, lineItems, notes) to null when not provided', async () => {
    const result = await useCase.execute(
      {
        caseId: 'case-1',
        hospitalId: 'hosp-1',
        totalAmount: '5000.00',
        validUntil: '2026-04-16T00:00:00.000Z',
      },
      hospitalActor,
    );

    expect(result.treatmentPlan).toBeNull();
    expect(result.lineItems).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('throws ForbiddenError for ADMIN actor', async () => {
    await expect(
      useCase.execute(
        { caseId: 'case-1', hospitalId: 'hosp-1', totalAmount: '5000.00', validUntil: '2026-04-16T00:00:00.000Z' },
        adminActor,
      ),
    ).rejects.toThrow('Only hospitals can create quotes');
  });

  it('throws ForbiddenError when hospitalId does not match actor', async () => {
    await expect(
      useCase.execute(
        { caseId: 'case-1', hospitalId: 'hosp-2', totalAmount: '5000.00', validUntil: '2026-04-16T00:00:00.000Z' },
        hospitalActor,
      ),
    ).rejects.toThrow('Can only create quotes for your own hospital');
  });
});

// =============== UpdateQuoteUseCase ===============
describe('UpdateQuoteUseCase', () => {
  let useCase: UpdateQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    useCase = new UpdateQuoteUseCase(mockQuoteRepo);
  });

  it('updates fields on a draft quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    const result = await useCase.execute(
      'quote-1',
      { totalAmount: '7500.00', treatmentPlan: 'Updated plan', notes: 'Updated notes' },
      hospitalActor,
    );

    expect(mockQuoteRepo.save).toHaveBeenCalledOnce();
    expect(result.totalAmount).toBe('7500.00');
    expect(result.treatmentPlan).toBe('Updated plan');
    expect(result.notes).toBe('Updated notes');
  });

  it('updates only provided fields (partial update)', async () => {
    const original = makeMockQuote();
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(original);

    const result = await useCase.execute('quote-1', { totalAmount: '8000.00' }, hospitalActor);

    expect(result.totalAmount).toBe('8000.00');
    expect(result.treatmentPlan).toBe('Initial plan'); // unchanged
    expect(result.notes).toBe('Some notes'); // unchanged
  });

  it('updates validUntil date', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    const result = await useCase.execute(
      'quote-1',
      { validUntil: '2026-05-01T00:00:00.000Z' },
      hospitalActor,
    );

    expect(result.validUntil).toBe(new Date('2026-05-01T00:00:00.000Z').toISOString());
  });

  it('rejects update on a sent (non-draft) quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ isDraft: false, sentAt: new Date() }),
    );

    await expect(
      useCase.execute('quote-1', { totalAmount: '9000.00' }, hospitalActor),
    ).rejects.toThrow('Can only update draft quotes');
  });

  it('throws ForbiddenError for ADMIN actor', async () => {
    await expect(
      useCase.execute('quote-1', { totalAmount: '9000.00' }, adminActor),
    ).rejects.toThrow('Only hospitals can update quotes');
  });

  it('throws ForbiddenError when hospital does not own the quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ hospitalId: 'hosp-2' }),
    );

    await expect(
      useCase.execute('quote-1', { totalAmount: '9000.00' }, hospitalActor),
    ).rejects.toThrow('Can only update your own quotes');
  });

  it('throws NotFoundError when quote does not exist', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', { totalAmount: '9000.00' }, hospitalActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });
});

// =============== SendQuoteUseCase ===============
describe('SendQuoteUseCase', () => {
  let useCase: SendQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCHCRepo: ICHCRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCHCRepo = createMockCHCRepo();
    useCase = new SendQuoteUseCase(mockQuoteRepo, mockCHCRepo);
  });

  it('sends a draft quote (isDraft=false, sentAt set)', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCHC());

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(mockQuoteRepo.save).toHaveBeenCalledOnce();
    expect(result.isDraft).toBe(false);
    expect(result.sentAt).not.toBeNull();
  });

  it('updates CHC sub_status to QUOTED and sets firstReplyAt', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());
    const chc = makeMockCHC();
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    await useCase.execute('quote-1', hospitalActor);

    expect(mockCHCRepo.save).toHaveBeenCalledOnce();
    expect(chc.subStatus).toBe('QUOTED');
    expect(chc.quoteId).toBe('quote-1');
    expect(chc.firstReplyAt).toBeTruthy();
  });

  it('does not overwrite existing firstReplyAt', async () => {
    const existingDate = new Date('2026-02-01');
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());
    const chc = makeMockCHC({ firstReplyAt: existingDate });
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    await useCase.execute('quote-1', hospitalActor);

    expect(chc.firstReplyAt).toEqual(existingDate);
  });

  it('succeeds even when no CHC exists', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(result.isDraft).toBe(false);
    expect(mockCHCRepo.save).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError for ADMIN actor', async () => {
    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Only hospitals can send quotes');
  });

  it('throws ForbiddenError when hospital does not own the quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ hospitalId: 'hosp-2' }),
    );

    await expect(
      useCase.execute('quote-1', hospitalActor),
    ).rejects.toThrow('Can only send your own quotes');
  });

  it('throws NotFoundError when quote does not exist', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', hospitalActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });
});

// =============== ListQuotesUseCase ===============
describe('ListQuotesUseCase', () => {
  let useCase: ListQuotesUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCaseRepo = createMockCaseRepo();
    useCase = new ListQuotesUseCase(mockQuoteRepo, mockCaseRepo);
  });

  it('returns paginated quotes by hospitalId for HOSPITAL actor', async () => {
    const quotes = [makeMockQuote(), makeMockQuote({ id: 'quote-2' })];
    (mockQuoteRepo.findByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: quotes, total: 2 });

    const result = await useCase.execute({ page: 1, limit: 20 }, hospitalActor);

    expect(mockQuoteRepo.findByHospitalId).toHaveBeenCalledWith('hosp-1', expect.objectContaining({ hospitalId: 'hosp-1' }));
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('scopes HOSPITAL actor to their own hospitalId', async () => {
    (mockQuoteRepo.findByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

    await useCase.execute({ page: 1, limit: 20, hospitalId: 'hosp-other' }, hospitalActor);

    // Should override the provided hospitalId with actor's hospitalId
    expect(mockQuoteRepo.findByHospitalId).toHaveBeenCalledWith('hosp-1', expect.objectContaining({ hospitalId: 'hosp-1' }));
  });

  it('ADMIN can list by caseId', async () => {
    const quotes = [makeMockQuote(), makeMockQuote({ id: 'quote-2', hospitalId: 'hosp-2' })];
    (mockQuoteRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(quotes);

    const result = await useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, adminActor);

    expect(mockQuoteRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('ADMIN can list by hospitalId', async () => {
    (mockQuoteRepo.findByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

    await useCase.execute({ hospitalId: 'hosp-1', page: 1, limit: 20 }, adminActor);

    expect(mockQuoteRepo.findByHospitalId).toHaveBeenCalledWith('hosp-1', expect.objectContaining({ hospitalId: 'hosp-1' }));
  });

  it('returns empty when no filter is provided for ADMIN', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('throws ForbiddenError for HOSPITAL actor without hospitalId', async () => {
    const badActor: Actor = { ...hospitalActor, hospitalId: null };

    await expect(
      useCase.execute({ page: 1, limit: 20 }, badActor),
    ).rejects.toThrow('Hospital actor missing hospitalId');
  });

  it('PATIENT can list quotes for own case', async () => {
    const quotes = [makeMockQuote()];
    (mockQuoteRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(quotes);

    const result = await useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, patientActor);

    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
    expect(result.data).toHaveLength(1);
  });

  it('throws ForbiddenError for PATIENT accessing other patient case', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, otherPatientActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('returns empty for PATIENT without caseId', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, patientActor);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// =============== GetQuoteUseCase ===============
describe('GetQuoteUseCase', () => {
  let useCase: GetQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCaseRepo = createMockCaseRepo();
    useCase = new GetQuoteUseCase(mockQuoteRepo, mockCaseRepo);
  });

  it('returns a single quote for ADMIN', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    const result = await useCase.execute('quote-1', adminActor);

    expect(result.id).toBe('quote-1');
    expect(result.quoteNumber).toBe('QT-20260316-0001');
  });

  it('returns a quote for HOSPITAL actor who owns it', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(result.id).toBe('quote-1');
  });

  it('throws ForbiddenError when HOSPITAL actor does not own the quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    await expect(
      useCase.execute('quote-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this quote');
  });

  it('throws NotFoundError when quote does not exist', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', adminActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });

  it('returns a quote for PATIENT who owns the case', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    const result = await useCase.execute('quote-1', patientActor);

    expect(result.id).toBe('quote-1');
    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
  });

  it('throws ForbiddenError for PATIENT who does not own the case', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockQuote());

    await expect(
      useCase.execute('quote-1', otherPatientActor),
    ).rejects.toThrow('Access denied to this quote');
  });
});

// =============== CompareQuotesUseCase ===============
describe('CompareQuotesUseCase', () => {
  let useCase: CompareQuotesUseCase;
  let mockQuoteRepo: IQuoteRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    useCase = new CompareQuotesUseCase(mockQuoteRepo);
  });

  it('returns all quotes for a case for ADMIN', async () => {
    const quotes = [
      makeMockQuote(),
      makeMockQuote({ id: 'quote-2', hospitalId: 'hosp-2', totalAmount: '7000.00' }),
    ];
    (mockQuoteRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(quotes);

    const result = await useCase.execute('case-1', adminActor);

    expect(mockQuoteRepo.findByCaseId).toHaveBeenCalledWith('case-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('quote-1');
    expect(result[1].id).toBe('quote-2');
  });

  it('returns empty array when no quotes exist for case', async () => {
    (mockQuoteRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await useCase.execute('case-1', adminActor);

    expect(result).toHaveLength(0);
  });

  it('throws ForbiddenError for HOSPITAL actor', async () => {
    await expect(
      useCase.execute('case-1', hospitalActor),
    ).rejects.toThrow('Only admins can compare quotes');
  });
});

// =============== ResendQuoteUseCase ===============
describe('ResendQuoteUseCase', () => {
  let useCase: ResendQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCHCRepo: ICHCRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCHCRepo = createMockCHCRepo();
    useCase = new ResendQuoteUseCase(mockQuoteRepo, mockCHCRepo);
  });

  it('transitions REJECTED quote to PENDING', async () => {
    const quote = makeMockQuote({ status: 'REJECTED', isDraft: false, sentAt: new Date('2026-03-10') });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockCHC({ subStatus: 'REJECTED' }),
    );

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(mockQuoteRepo.save).toHaveBeenCalledOnce();
    expect(result.status).toBe('PENDING');
    // Version increment is handled by the repository's optimistic lock, not entity
  });

  it('transitions EXPIRED quote to PENDING', async () => {
    const quote = makeMockQuote({ status: 'EXPIRED', isDraft: false, sentAt: new Date('2026-03-10') });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockCHC({ subStatus: 'EXPIRED' }),
    );

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(result.status).toBe('PENDING');
    // Version increment is handled by the repository's optimistic lock, not entity
  });

  it('updates CHC from REJECTED to QUOTED', async () => {
    const quote = makeMockQuote({ status: 'REJECTED', isDraft: false });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    const chc = makeMockCHC({ subStatus: 'REJECTED' });
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    await useCase.execute('quote-1', hospitalActor);

    expect(mockCHCRepo.save).toHaveBeenCalledOnce();
    expect(chc.subStatus).toBe('QUOTED');
  });

  it('updates CHC from EXPIRED to QUOTED', async () => {
    const quote = makeMockQuote({ status: 'EXPIRED', isDraft: false });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    const chc = makeMockCHC({ subStatus: 'EXPIRED' });
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    await useCase.execute('quote-1', hospitalActor);

    expect(mockCHCRepo.save).toHaveBeenCalledOnce();
    expect(chc.subStatus).toBe('QUOTED');
  });

  it('does not update CHC if subStatus is not REJECTED or EXPIRED', async () => {
    const quote = makeMockQuote({ status: 'REJECTED', isDraft: false });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    // CHC is already in QUOTED status
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockCHC({ subStatus: 'QUOTED' }),
    );

    await useCase.execute('quote-1', hospitalActor);

    expect(mockCHCRepo.save).not.toHaveBeenCalled();
  });

  it('succeeds even when no CHC exists', async () => {
    const quote = makeMockQuote({ status: 'REJECTED', isDraft: false });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('quote-1', hospitalActor);

    expect(result.status).toBe('PENDING');
    expect(mockCHCRepo.save).not.toHaveBeenCalled();
  });

  it('throws ValidationError when trying to resend a PENDING quote', async () => {
    const quote = makeMockQuote({ status: 'PENDING', isDraft: false });
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);

    await expect(
      useCase.execute('quote-1', hospitalActor),
    ).rejects.toThrow('Cannot transition quote status from PENDING to PENDING');
  });

  it('throws ForbiddenError for ADMIN actor', async () => {
    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Only hospitals can resend quotes');
  });

  it('throws ForbiddenError when hospital does not own the quote', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ hospitalId: 'hosp-2' }),
    );

    await expect(
      useCase.execute('quote-1', hospitalActor),
    ).rejects.toThrow('Can only resend your own quotes');
  });

  it('throws NotFoundError when quote does not exist', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', hospitalActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });
});

// =============== ListCaseHospitalContactsUseCase — PATIENT AuthZ ===============
describe('ListCaseHospitalContactsUseCase', () => {
  let useCase: ListCaseHospitalContactsUseCase;
  let mockCHCRepo: ICHCRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockCHCRepo = createMockCHCRepo();
    mockCaseRepo = createMockCaseRepo();
    useCase = new ListCaseHospitalContactsUseCase(mockCHCRepo, mockCaseRepo);
  });

  it('PATIENT can list contacts for own case', async () => {
    const contacts = [makeMockCHC()];
    (mockCHCRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(contacts);

    const result = await useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, patientActor);

    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
    expect(result.data).toHaveLength(1);
  });

  it('throws ForbiddenError for PATIENT accessing other patient case', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', page: 1, limit: 20 }, otherPatientActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('returns empty for PATIENT without caseId', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, patientActor);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
