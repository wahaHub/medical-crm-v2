import { describe, expect, it, vi } from 'vitest';
import type { ICaseProgressRepository, ICaseRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';
import type { Actor } from '../src/types/actor.js';
import { AdvanceCaseStageUseCase } from '../src/use-cases/cases/advance-case-stage.use-case.js';

const hospitalActor: Actor = {
  userId: 'hospital-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

function makeCase(): Case {
  return new Case({
    id: 'case-id-1',
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
    assignedAt: null,
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-10T08:00:00Z'),
    assignmentStatus: 'ASSIGNED',
    treatmentStage: null,
    conditionSummary: null,
    structuredData: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
  });
}

describe('AdvanceCaseStageUseCase', () => {
  it('blocks hospitals from advancing excluded patient email cases', async () => {
    const caseRepo: ICaseRepository = {
      findById: vi.fn().mockResolvedValue(makeCase()),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    const progressRepo: ICaseProgressRepository = {
      findByCaseId: vi.fn(),
      save: vi.fn(),
    };
    const adminAccess = {
      assertActorCanAccessCaseEntity: vi.fn().mockResolvedValue(undefined),
      assertStaffCaseNotExcludedByPatientEmail: vi.fn().mockRejectedValue(new Error('Case case-id-1 not found')),
    } as unknown as AdminPatientSiteAccessPolicy;
    const useCase = new AdvanceCaseStageUseCase(caseRepo, progressRepo, adminAccess);

    await expect(
      useCase.execute('case-id-1', 'CONFIRMED', hospitalActor),
    ).rejects.toThrow('Case case-id-1 not found');

    expect(caseRepo.save).not.toHaveBeenCalled();
    expect(progressRepo.save).not.toHaveBeenCalled();
  });
});
