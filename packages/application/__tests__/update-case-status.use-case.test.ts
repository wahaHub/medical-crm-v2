import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCaseStatusUseCase } from '../src/use-cases/cases/update-case-status.use-case.js';
import type { ICaseRepository, ICaseProgressRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('UpdateCaseStatusUseCase', () => {
  let useCase: UpdateCaseStatusUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockProgressRepo: ICaseProgressRepository;

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

  const makeMockCase = (status: string = 'DRAFT', assignedHospitalId: string | null = 'hosp-1') =>
    new Case({
      id: 'case-id-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'John Doe',
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
      status: status as 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED',
      stage: 'TRANSFERRED_TO_HOSPITAL',
      assignedAt: null,
      createdAt: new Date('2026-01-10T08:00:00Z'),
      updatedAt: new Date('2026-01-10T08:00:00Z'),
    });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeMockCase()),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };

    useCase = new UpdateCaseStatusUseCase(mockCaseRepo, mockProgressRepo);
  });

  it('calls case.transitionStatus() and saves the updated case', async () => {
    const result = await useCase.execute('case-id-1', 'ACTIVE', adminActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(result.status).toBe('ACTIVE');
    expect(result.id).toBe('case-id-1');
  });

  it('creates a STATUS_CHANGE progress entry with old and new status', async () => {
    await useCase.execute('case-id-1', 'ACTIVE', adminActor);

    expect(mockProgressRepo.save).toHaveBeenCalledOnce();
    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.progressType).toBe('STATUS_CHANGE');
    expect(savedProgress.caseId).toBe('case-id-1');
    expect(savedProgress.title).toContain('DRAFT');
    expect(savedProgress.title).toContain('ACTIVE');
    expect(savedProgress.metadata).toMatchObject({ from: 'DRAFT', to: 'ACTIVE' });
    expect(savedProgress.recordedById).toBe('admin-1');
  });

  it('allows ADMIN to update status for any case', async () => {
    const result = await useCase.execute('case-id-1', 'ACTIVE', adminActor);

    expect(result.status).toBe('ACTIVE');
  });

  it('allows HOSPITAL actor to update status for their own case', async () => {
    const result = await useCase.execute('case-id-1', 'ACTIVE', hospitalActor);

    expect(result.status).toBe('ACTIVE');
  });

  it('throws ForbiddenError when HOSPITAL actor accesses a case of a different hospital', async () => {
    await expect(
      useCase.execute('case-id-1', 'ACTIVE', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-id', 'ACTIVE', adminActor),
    ).rejects.toThrow('Case nonexistent-id not found');
  });

  it('throws ValidationError on invalid status transition (DRAFT -> COMPLETED)', async () => {
    await expect(
      useCase.execute('case-id-1', 'COMPLETED', adminActor),
    ).rejects.toThrow('Cannot transition case status from DRAFT to COMPLETED');
  });

  it('throws ValidationError on transition from ARCHIVED (no transitions allowed)', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(makeMockCase('ARCHIVED'));

    await expect(
      useCase.execute('case-id-1', 'ACTIVE', adminActor),
    ).rejects.toThrow('Cannot transition case status from ARCHIVED to ACTIVE');
  });

  it('does not create progress entry if save throws', async () => {
    mockCaseRepo.save = vi.fn().mockRejectedValue(new Error('DB error'));

    await expect(
      useCase.execute('case-id-1', 'ACTIVE', adminActor),
    ).rejects.toThrow('DB error');

    expect(mockProgressRepo.save).not.toHaveBeenCalled();
  });

  it('records progress with the actor userId', async () => {
    const actorWithId: Actor = { ...hospitalActor, userId: 'staff-99' };

    await useCase.execute('case-id-1', 'ACTIVE', actorWithId);

    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.recordedById).toBe('staff-99');
  });
});
