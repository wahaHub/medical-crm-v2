import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddCaseProgressUseCase } from '../src/use-cases/progress/add-case-progress.use-case.js';
import type { ICaseProgressRepository, ICaseRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('AddCaseProgressUseCase', () => {
  let useCase: AddCaseProgressUseCase;
  let mockProgressRepo: ICaseProgressRepository;
  let mockCaseRepo: ICaseRepository;

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

  const makeFreshCase = (assignedHospitalId: string | null = 'hosp-1') =>
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

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockImplementation(() => Promise.resolve(makeFreshCase())),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };

    useCase = new AddCaseProgressUseCase(mockProgressRepo, mockCaseRepo);
  });

  describe('DIAGNOSIS type', () => {
    it('maps to progressType STATUS_CHANGE with kind=diagnosis metadata', async () => {
      const result = await useCase.execute(
        {
          type: 'DIAGNOSIS',
          caseId: 'case-1',
          icdCode: 'J30.1',
          severity: 'MILD',
          treatmentRecommendation: 'Antihistamines',
          suggestedTests: 'Allergy panel',
          costEstimate: '$500',
          treatmentDuration: '2 weeks',
        },
        adminActor,
      );

      expect(result.progressType).toBe('STATUS_CHANGE');
      expect(result.title).toBe('Diagnosis recorded');
      expect(result.metadata).toMatchObject({
        kind: 'diagnosis',
        icdCode: 'J30.1',
        severity: 'MILD',
        treatmentRecommendation: 'Antihistamines',
        suggestedTests: 'Allergy panel',
        costEstimate: '$500',
        treatmentDuration: '2 weeks',
      });
    });

    it('saves with correct caseId and recordedById', async () => {
      await useCase.execute({ type: 'DIAGNOSIS', caseId: 'case-1' }, adminActor);

      const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(savedProgress.caseId).toBe('case-1');
      expect(savedProgress.recordedById).toBe('admin-1');
    });
  });

  describe('PHONE_CALL type', () => {
    it('maps to progressType APPOINTMENT with kind=phone_call metadata', async () => {
      const result = await useCase.execute(
        {
          type: 'PHONE_CALL',
          caseId: 'case-1',
          callResult: 'ANSWERED',
          summary: 'Patient confirmed appointment',
          duration: 10,
          nextFollowUp: '2026-03-20',
        },
        adminActor,
      );

      expect(result.progressType).toBe('APPOINTMENT');
      expect(result.title).toBe('Phone follow-up');
      expect(result.metadata).toMatchObject({
        kind: 'phone_call',
        callResult: 'ANSWERED',
        summary: 'Patient confirmed appointment',
        duration: 10,
        nextFollowUp: '2026-03-20',
      });
    });
  });

  describe('STATUS_CHANGE type', () => {
    it('maps to progressType STATUS_CHANGE with kind=status_change metadata', async () => {
      const result = await useCase.execute(
        {
          type: 'STATUS_CHANGE',
          caseId: 'case-1',
          reason: 'Patient requested cancellation',
        },
        adminActor,
      );

      expect(result.progressType).toBe('STATUS_CHANGE');
      expect(result.title).toBe('Status changed');
      expect(result.metadata).toMatchObject({
        kind: 'status_change',
        reason: 'Patient requested cancellation',
      });
    });
  });

  describe('DOCUMENT_UPLOAD type', () => {
    it('maps to progressType DOCUMENT_UPLOAD with documentId metadata', async () => {
      const result = await useCase.execute(
        {
          type: 'DOCUMENT_UPLOAD',
          caseId: 'case-1',
          documentId: 'doc-abc-123',
        },
        adminActor,
      );

      expect(result.progressType).toBe('DOCUMENT_UPLOAD');
      expect(result.title).toBe('Document uploaded');
      expect(result.metadata).toMatchObject({ documentId: 'doc-abc-123' });
    });
  });

  describe('authorization', () => {
    it('throws NotFoundError when case does not exist', async () => {
      mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(
        useCase.execute({ type: 'STATUS_CHANGE', caseId: 'nonexistent' }, adminActor),
      ).rejects.toThrow('Case nonexistent not found');
    });

    it('throws ForbiddenError when hospital actor accesses a different hospital case', async () => {
      mockCaseRepo.findById = vi.fn().mockImplementation(() =>
        Promise.resolve(makeFreshCase('other-hosp')),
      );

      await expect(
        useCase.execute({ type: 'STATUS_CHANGE', caseId: 'case-1' }, hospitalActor),
      ).rejects.toThrow('Access denied to this case');
    });

    it('allows hospital actor to add progress to their own assigned case', async () => {
      // makeFreshCase defaults to assignedHospitalId = 'hosp-1' (same as hospitalActor)
      const result = await useCase.execute(
        { type: 'STATUS_CHANGE', caseId: 'case-1' },
        hospitalActor,
      );

      expect(result.progressType).toBe('STATUS_CHANGE');
      expect(mockProgressRepo.save).toHaveBeenCalledOnce();
    });
  });

  it('returns a CaseProgressDTO with an id and recordedAt', async () => {
    const result = await useCase.execute(
      { type: 'STATUS_CHANGE', caseId: 'case-1' },
      adminActor,
    );

    expect(result.id).toBeTruthy();
    expect(result.recordedAt).toBeTruthy();
    expect(typeof result.recordedAt).toBe('string');
  });
});
