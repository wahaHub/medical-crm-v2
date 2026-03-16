import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminResetAssignmentUseCase } from '../src/use-cases/quotes/admin-reset-assignment.use-case.js';
import type { ICHCRepository, ICaseRepository, TransactionRunner } from '@medical-crm/domain';
import { Case, CaseNumber, CaseHospitalContact } from '@medical-crm/domain';
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
function makeMockCHC(overrides: Partial<ConstructorParameters<typeof CaseHospitalContact>[0]> = {}): CaseHospitalContact {
  return new CaseHospitalContact({
    id: 'chc-1',
    caseId: 'case-1',
    hospitalId: 'hosp-1',
    subStatus: 'ACCEPTED',
    selectedByPatientAt: null,
    distributedAt: new Date(),
    firstReplyAt: new Date(),
    quoteId: 'quote-1',
    patientViewedQuoteAt: null,
    patientAcceptedAt: new Date(),
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
    assignedHospitalId: 'hosp-1',
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    assignmentStatus: 'ASSIGNED',
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

describe('AdminResetAssignmentUseCase', () => {
  let useCase: AdminResetAssignmentUseCase;
  let mockCHCRepo: ICHCRepository;
  let mockCaseRepo: ICaseRepository;
  let mockTxRunner: TransactionRunner;

  beforeEach(() => {
    mockCHCRepo = createMockCHCRepo();
    mockCaseRepo = createMockCaseRepo();
    mockTxRunner = createMockTxRunner();
    useCase = new AdminResetAssignmentUseCase(mockCHCRepo, mockCaseRepo, mockTxRunner);
  });

  it('resets case assignment and CHCs (happy path)', async () => {
    const caseEntity = makeMockCase();
    const acceptedChc = makeMockCHC({ id: 'chc-1', subStatus: 'ACCEPTED', patientAcceptedAt: new Date() });
    const rejectedChc = makeMockCHC({ id: 'chc-2', hospitalId: 'hosp-2', subStatus: 'REJECTED', patientRejectedAt: new Date() });
    const distributedChc = makeMockCHC({ id: 'chc-3', hospitalId: 'hosp-3', subStatus: 'DISTRIBUTED' });

    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);
    (mockCHCRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([acceptedChc, rejectedChc, distributedChc]);

    await useCase.execute('case-1', adminActor);

    // Case unassigned
    expect(caseEntity.assignmentStatus).toBe('UNASSIGNED');
    expect(caseEntity.assignedHospitalId).toBeNull();
    expect(caseEntity.assignedAt).toBeNull();
    expect(mockCaseRepo.save).toHaveBeenCalledWith(caseEntity, 'mock-tx');

    // Accepted CHC reset to DISTRIBUTED
    expect(acceptedChc.subStatus).toBe('DISTRIBUTED');
    expect(acceptedChc.patientAcceptedAt).toBeNull();
    expect(acceptedChc.patientRejectedAt).toBeNull();

    // Rejected CHC reset to DISTRIBUTED
    expect(rejectedChc.subStatus).toBe('DISTRIBUTED');
    expect(rejectedChc.patientRejectedAt).toBeNull();

    // Distributed CHC left unchanged (save not called for it)
    expect(distributedChc.subStatus).toBe('DISTRIBUTED');

    // save was called for accepted and rejected CHCs but not distributed
    expect(mockCHCRepo.save).toHaveBeenCalledTimes(2);
    expect(mockCHCRepo.save).toHaveBeenCalledWith(acceptedChc, 'mock-tx');
    expect(mockCHCRepo.save).toHaveBeenCalledWith(rejectedChc, 'mock-tx');
  });

  it('throws ForbiddenError for non-ADMIN', async () => {
    await expect(
      useCase.execute('case-1', hospitalActor),
    ).rejects.toThrow('Only admins can reset assignments');

    expect(mockTxRunner.run).not.toHaveBeenCalled();
  });

  it('throws NotFoundError if case not found', async () => {
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('case-999', adminActor),
    ).rejects.toThrow('Case case-999 not found');
  });

  it('throws ValidationError if case not ASSIGNED', async () => {
    const caseEntity = makeMockCase({ assignmentStatus: 'UNASSIGNED' });
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);

    await expect(
      useCase.execute('case-1', adminActor),
    ).rejects.toThrow('Case is not assigned');
  });

  it('uses TransactionRunner for atomicity', async () => {
    const caseEntity = makeMockCase();
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);
    (mockCHCRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await useCase.execute('case-1', adminActor);

    expect(mockTxRunner.run).toHaveBeenCalledOnce();
    expect(mockTxRunner.run).toHaveBeenCalledWith(expect.any(Function));
  });

  it('passes the tx to all repository calls', async () => {
    const caseEntity = makeMockCase();
    const chc = makeMockCHC({ subStatus: 'ACCEPTED' });

    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);
    (mockCHCRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([chc]);

    await useCase.execute('case-1', adminActor);

    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1', 'mock-tx');
    expect(mockCHCRepo.findByCaseId).toHaveBeenCalledWith('case-1', 'mock-tx');
    expect(mockCaseRepo.save).toHaveBeenCalledWith(caseEntity, 'mock-tx');
    expect(mockCHCRepo.save).toHaveBeenCalledWith(chc, 'mock-tx');
  });

  it('handles no CHCs gracefully', async () => {
    const caseEntity = makeMockCase();
    (mockCaseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(caseEntity);
    (mockCHCRepo.findByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await useCase.execute('case-1', adminActor);

    // Case should still be unassigned even with no CHCs
    expect(caseEntity.assignmentStatus).toBe('UNASSIGNED');
    expect(mockCHCRepo.save).not.toHaveBeenCalled();
  });
});
