import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCaseUseCase } from '../src/use-cases/cases/get-case.use-case.js';
import type { ICaseRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetCaseUseCase', () => {
  let useCase: GetCaseUseCase;
  let mockCaseRepo: ICaseRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-1',
  };

  const otherHospitalActor: Actor = {
    userId: 'hospital-2',
    email: 'other@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-2',
  };

  const mockCase = new Case({
    id: 'case-id-1',
    caseNumber: new CaseNumber('CASE-2026-0042'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: 'CN',
    patientLanguage: 'zh',
    assignedHospitalId: 'hosp-1',
    primaryDiagnosis: 'Double eyelid surgery',
    diagnosisCode: null,
    symptoms: ['drooping eyelids'],
    medicalHistory: 'No known allergies',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date('2026-01-15T10:00:00Z'),
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(mockCase),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    useCase = new GetCaseUseCase(mockCaseRepo);
  });

  it('returns CaseDTO for ADMIN actor', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.id).toBe('case-id-1');
    expect(result.caseNumber).toBe('CASE-2026-0042');
    expect(result.patientName).toBe('Jane Doe');
    expect(result.status).toBe('ACTIVE');
    expect(result.stage).toBe('TRANSFERRED_TO_HOSPITAL');
    expect(result.primaryDiagnosis).toBe('Double eyelid surgery');
    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-id-1');
  });

  it('returns CaseDTO when HOSPITAL actor owns the case', async () => {
    const result = await useCase.execute('case-id-1', hospitalActor);

    expect(result.id).toBe('case-id-1');
    expect(result.caseNumber).toBe('CASE-2026-0042');
  });

  it('throws ForbiddenError when HOSPITAL actor accesses a case belonging to a different hospital', async () => {
    await expect(
      useCase.execute('case-id-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-id', adminActor),
    ).rejects.toThrow('Case nonexistent-id not found');
  });

  it('throws NotFoundError with correct message for HOSPITAL actor on missing case', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-case', hospitalActor),
    ).rejects.toThrow('Case missing-case not found');
  });

  it('maps assignedAt as ISO string in the DTO', async () => {
    const result = await useCase.execute('case-id-1', adminActor);
    expect(result.assignedAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('maps createdAt and updatedAt as ISO strings in the DTO', async () => {
    const result = await useCase.execute('case-id-1', adminActor);
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-15T10:00:00.000Z');
  });
});
