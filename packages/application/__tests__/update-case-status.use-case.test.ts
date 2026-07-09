import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCaseStatusUseCase } from '../src/use-cases/cases/update-case-status.use-case.js';
import type { ICaseRepository, ICaseProgressRepository, CaseAssignmentStatus } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';

describe('UpdateCaseStatusUseCase', () => {
  let useCase: UpdateCaseStatusUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockAdminAccess: AdminPatientSiteAccessPolicy;

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

  const makeMockCase = (
    assignmentStatus: CaseAssignmentStatus = 'UNASSIGNED',
    assignedHospitalId: string | null = 'hosp-1',
  ) =>
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
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: new Date('2026-01-10T08:00:00Z'),
      updatedAt: new Date('2026-01-10T08:00:00Z'),
      assignmentStatus,
      treatmentStage: null,
      conditionSummary: null,
      structuredData: null,
      riskFlags: null,
      priority: null,
      lastEventAt: null,
      aiSummaryStatus: 'PENDING',
      questionCollectorTemplateId: null,
    });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(makeMockCase()),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };

    mockAdminAccess = {
      assertActorCanAccessCaseEntity: vi.fn().mockResolvedValue(undefined),
      assertStaffCaseNotExcludedByPatientEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminPatientSiteAccessPolicy;

    useCase = new UpdateCaseStatusUseCase(mockCaseRepo, mockProgressRepo, mockAdminAccess);
  });

  it('calls entity.transitionAssignmentStatus() and saves the updated case', async () => {
    const result = await useCase.execute('case-id-1', 'ASSIGNED', adminActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(result.assignmentStatus).toBe('ASSIGNED');
    expect(result.id).toBe('case-id-1');
  });

  it('creates a STATUS_CHANGE progress entry with old and new assignment status', async () => {
    await useCase.execute('case-id-1', 'ASSIGNED', adminActor);

    expect(mockProgressRepo.save).toHaveBeenCalledOnce();
    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.progressType).toBe('STATUS_CHANGE');
    expect(savedProgress.caseId).toBe('case-id-1');
    expect(savedProgress.title).toContain('UNASSIGNED');
    expect(savedProgress.title).toContain('ASSIGNED');
    expect(savedProgress.title).toContain('Assignment status');
    expect(savedProgress.metadata).toMatchObject({ from: 'UNASSIGNED', to: 'ASSIGNED' });
    expect(savedProgress.recordedById).toBe('admin-1');
  });

  it('allows ADMIN to update assignment status for any case', async () => {
    const result = await useCase.execute('case-id-1', 'ASSIGNED', adminActor);

    expect(result.assignmentStatus).toBe('ASSIGNED');
  });

  it('allows HOSPITAL actor to update assignment status for their own case', async () => {
    const result = await useCase.execute('case-id-1', 'ASSIGNED', hospitalActor);

    expect(result.assignmentStatus).toBe('ASSIGNED');
  });

  it('throws ForbiddenError when HOSPITAL actor accesses a case of a different hospital', async () => {
    await expect(
      useCase.execute('case-id-1', 'ASSIGNED', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-id', 'ASSIGNED', adminActor),
    ).rejects.toThrow('Case nonexistent-id not found');
  });

  it('throws ValidationError on invalid assignment status transition (ASSIGNED -> ASSIGNED)', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(makeMockCase('ASSIGNED'));

    await expect(
      useCase.execute('case-id-1', 'ASSIGNED', adminActor),
    ).rejects.toThrow('Cannot transition assignment status from ASSIGNED to ASSIGNED');
  });

  it('does not create progress entry if save throws', async () => {
    mockCaseRepo.save = vi.fn().mockRejectedValue(new Error('DB error'));

    await expect(
      useCase.execute('case-id-1', 'ASSIGNED', adminActor),
    ).rejects.toThrow('DB error');

    expect(mockProgressRepo.save).not.toHaveBeenCalled();
  });

  it('records progress with the actor userId', async () => {
    const actorWithId: Actor = { ...hospitalActor, userId: 'staff-99' };

    await useCase.execute('case-id-1', 'ASSIGNED', actorWithId);

    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.recordedById).toBe('staff-99');
  });

  it('blocks hospitals from updating status for excluded patient email cases', async () => {
    vi.mocked(mockAdminAccess.assertStaffCaseNotExcludedByPatientEmail).mockRejectedValueOnce(
      new Error('Case case-id-1 not found'),
    );

    await expect(
      useCase.execute('case-id-1', 'ASSIGNED', hospitalActor),
    ).rejects.toThrow('Case case-id-1 not found');

    expect(mockCaseRepo.save).not.toHaveBeenCalled();
    expect(mockProgressRepo.save).not.toHaveBeenCalled();
  });

  it('allows transitioning back from ASSIGNED to UNASSIGNED', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(makeMockCase('ASSIGNED'));

    const result = await useCase.execute('case-id-1', 'UNASSIGNED', adminActor);

    expect(result.assignmentStatus).toBe('UNASSIGNED');
  });
});
