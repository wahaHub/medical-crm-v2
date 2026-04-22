import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICaseProgressRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { SaveCaseDiagnosisUseCase } from '../src/use-cases/cases/save-case-diagnosis.use-case.js';

const hospitalActor: Actor = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const makeCase = (overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}) =>
  new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: null,
    patientLanguage: 'en',
    assignedHospitalId: 'hosp-primary',
    primaryDiagnosis: 'Original diagnosis',
    diagnosisCode: 'OLD.1',
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
    ...overrides,
  });

describe('SaveCaseDiagnosisUseCase', () => {
  let mockCaseRepo: ICaseRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockChcRepo: ICHCRepository;
  let useCase: SaveCaseDiagnosisUseCase;
  let savedSnapshots: Array<{ primaryDiagnosis: string | null; diagnosisCode: string | null }>;

  beforeEach(() => {
    savedSnapshots = [];
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeCase()),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation(async (entity) => {
        savedSnapshots.push({
          primaryDiagnosis: entity.primaryDiagnosis,
          diagnosisCode: entity.diagnosisCode,
        });
        return entity;
      }),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    mockProgressRepo = {
      findById: vi.fn(),
      findByCaseId: vi.fn(),
      save: vi.fn().mockResolvedValue({
        id: 'progress-1',
        caseId: 'case-1',
        title: 'Updated diagnosis',
        description: 'Detailed note',
        progressType: 'STATUS_CHANGE',
        metadata: {
          kind: 'diagnosis',
          icdCode: 'NEW.2',
        },
        recordedAt: new Date('2026-03-01T08:00:00Z'),
        recordedById: hospitalActor.userId,
      }),
    } as unknown as ICaseProgressRepository;
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn().mockResolvedValue({
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
      } as any),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };
    useCase = new SaveCaseDiagnosisUseCase(mockCaseRepo, mockProgressRepo, mockChcRepo);
  });

  it('allows distributed hospitals to save diagnosis and progress in one use case', async () => {
    await useCase.execute('case-1', {
      title: 'Updated diagnosis',
      icdCode: 'NEW.2',
      description: 'Detailed note',
    }, hospitalActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(mockProgressRepo.save).toHaveBeenCalledOnce();
  });

  it('restores the previous diagnosis fields when progress recording fails', async () => {
    vi.mocked(mockProgressRepo.save).mockRejectedValueOnce(new Error('db write failed'));

    await expect(
      useCase.execute('case-1', {
        title: 'Updated diagnosis',
        icdCode: 'NEW.2',
        description: 'Detailed note',
      }, hospitalActor),
    ).rejects.toThrow('db write failed');

    expect(mockCaseRepo.save).toHaveBeenCalledTimes(2);
    expect(savedSnapshots[0]).toEqual({
      primaryDiagnosis: 'Updated diagnosis',
      diagnosisCode: 'NEW.2',
    });
    expect(savedSnapshots[1]).toEqual({
      primaryDiagnosis: 'Original diagnosis',
      diagnosisCode: 'OLD.1',
    });
  });
});
