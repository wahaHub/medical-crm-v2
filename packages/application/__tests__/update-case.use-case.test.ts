import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { UpdateCaseUseCase } from '../src/use-cases/cases/update-case.use-case.js';

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const makeCase = (assignedHospitalId: string | null = 'hosp-1') =>
  new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: null,
    patientLanguage: 'en',
    assignedHospitalId,
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
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-10T08:00:00Z'),
  });

describe('UpdateCaseUseCase', () => {
  let mockCaseRepo: ICaseRepository;
  let mockChcRepo: ICHCRepository;
  let useCase: UpdateCaseUseCase;

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeCase()),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };
    useCase = new UpdateCaseUseCase(mockCaseRepo, mockChcRepo);
  });

  it('updates diagnosis fields for admins', async () => {
    await useCase.execute('case-1', {
      primaryDiagnosis: 'Updated diagnosis',
      diagnosisCode: 'A01.1',
    }, adminActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    const savedCase = vi.mocked(mockCaseRepo.save).mock.calls[0]?.[0];
    expect(savedCase?.primaryDiagnosis).toBe('Updated diagnosis');
    expect(savedCase?.diagnosisCode).toBe('A01.1');
  });

  it('allows distributed hospital contacts to update case diagnosis fields', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(makeCase('primary-hosp'));
    vi.mocked(mockChcRepo.findByCaseAndHospital).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hosp-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date('2026-03-01T08:00:00Z'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-03-01T08:00:00Z'),
      updatedAt: new Date('2026-03-01T08:00:00Z'),
    } as any);

    await useCase.execute('case-1', {
      primaryDiagnosis: 'Distributed diagnosis',
      diagnosisCode: 'B02.2',
    }, hospitalActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    const savedCase = vi.mocked(mockCaseRepo.save).mock.calls[0]?.[0];
    expect(savedCase?.primaryDiagnosis).toBe('Distributed diagnosis');
    expect(savedCase?.diagnosisCode).toBe('B02.2');
  });
});
