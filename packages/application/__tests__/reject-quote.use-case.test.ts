import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectQuoteUseCase } from '../src/use-cases/quotes/reject-quote.use-case.js';
import type { IQuoteRepository, ICHCRepository } from '@medical-crm/domain';
import { Quote, QuoteNumber, CaseHospitalContact } from '@medical-crm/domain';
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

describe('RejectQuoteUseCase', () => {
  let useCase: RejectQuoteUseCase;
  let mockQuoteRepo: IQuoteRepository;
  let mockCHCRepo: ICHCRepository;

  beforeEach(() => {
    mockQuoteRepo = createMockQuoteRepo();
    mockCHCRepo = createMockCHCRepo();
    useCase = new RejectQuoteUseCase(mockQuoteRepo, mockCHCRepo);
  });

  it('rejects quote and updates CHC to REJECTED (happy path)', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC({ subStatus: 'QUOTED' });

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    const result = await useCase.execute('quote-1', adminActor);

    // Quote rejected
    expect(result.status).toBe('REJECTED');
    expect(mockQuoteRepo.save).toHaveBeenCalledOnce();

    // CHC updated to REJECTED
    expect(chc.subStatus).toBe('REJECTED');
    expect(chc.patientRejectedAt).toBeTruthy();
    expect(mockCHCRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for non-ADMIN', async () => {
    await expect(
      useCase.execute('quote-1', hospitalActor),
    ).rejects.toThrow('Only admins can reject quotes');
  });

  it('throws NotFoundError if quote not found', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('quote-999', adminActor),
    ).rejects.toThrow('Quote quote-999 not found');
  });

  it('throws ConflictError if quote not PENDING', async () => {
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockQuote({ status: 'REJECTED' }),
    );

    await expect(
      useCase.execute('quote-1', adminActor),
    ).rejects.toThrow('Quote is not in PENDING status');
  });

  it('handles missing CHC gracefully (does not throw)', async () => {
    const quote = makeMockQuote();
    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('quote-1', adminActor);

    expect(result.status).toBe('REJECTED');
    expect(mockCHCRepo.save).not.toHaveBeenCalled();
  });

  it('does not update CHC if subStatus is not QUOTED', async () => {
    const quote = makeMockQuote();
    const chc = makeMockCHC({ subStatus: 'DISTRIBUTED' });

    (mockQuoteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(quote);
    (mockCHCRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue(chc);

    const result = await useCase.execute('quote-1', adminActor);

    expect(result.status).toBe('REJECTED');
    // CHC should not have been saved because subStatus was not QUOTED
    expect(mockCHCRepo.save).not.toHaveBeenCalled();
    expect(chc.subStatus).toBe('DISTRIBUTED');
  });
});
