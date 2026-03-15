import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignCaseUseCase } from '../src/use-cases/cases/assign-case.use-case.js';
import type { ICaseRepository, IHospitalRepository, ICaseProgressRepository } from '@medical-crm/domain';
import { Case, CaseNumber, CaseAssignmentService } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('AssignCaseUseCase', () => {
  let useCase: AssignCaseUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockHospitalRepo: IHospitalRepository;
  let mockAssignmentService: CaseAssignmentService;
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

  const makeFreshCase = () => new Case({
    id: 'case-id-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    patientName: 'John Doe',
    patientCountry: null,
    patientLanguage: 'en',
    assignedHospitalId: null,
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
  });

  const mockHospital = { id: 'hosp-1', name: 'City Hospital', status: 'ACTIVE' };

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockImplementation(() => Promise.resolve(makeFreshCase())),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockHospitalRepo = {
      findById: vi.fn().mockResolvedValue(mockHospital),
    };

    mockAssignmentService = new CaseAssignmentService();
    vi.spyOn(mockAssignmentService, 'validateAssignment');

    mockProgressRepo = {
      findByCaseId: vi.fn(),
      save: vi.fn().mockImplementation((progress) => Promise.resolve(progress)),
    };

    useCase = new AssignCaseUseCase(
      mockCaseRepo,
      mockHospitalRepo,
      mockAssignmentService,
      mockProgressRepo,
    );
  });

  it('calls CaseAssignmentService.validateAssignment before assigning', async () => {
    await useCase.execute('case-id-1', 'hosp-1', adminActor);

    expect(mockAssignmentService.validateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'case-id-1' }),
      'hosp-1',
      'ACTIVE',
    );
  });

  it('calls case.assign() and saves the case', async () => {
    const result = await useCase.execute('case-id-1', 'hosp-1', adminActor);

    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(result.assignedHospitalId).toBe('hosp-1');
    // After assign(), stage changes from PENDING_ASSIGNMENT to TRANSFERRED_TO_HOSPITAL
    expect(result.stage).toBe('TRANSFERRED_TO_HOSPITAL');
  });

  it('automatically creates a STATUS_CHANGE progress entry', async () => {
    await useCase.execute('case-id-1', 'hosp-1', adminActor);

    expect(mockProgressRepo.save).toHaveBeenCalledOnce();
    const savedProgress = (mockProgressRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedProgress.progressType).toBe('STATUS_CHANGE');
    expect(savedProgress.caseId).toBe('case-id-1');
    expect(savedProgress.title).toContain('City Hospital');
    expect(savedProgress.metadata).toMatchObject({ hospitalId: 'hosp-1', hospitalName: 'City Hospital' });
    expect(savedProgress.recordedById).toBe('admin-1');
  });

  it('returns CaseDTO with assignedHospitalId set', async () => {
    const result = await useCase.execute('case-id-1', 'hosp-1', adminActor);

    expect(result.id).toBe('case-id-1');
    expect(result.assignedHospitalId).toBe('hosp-1');
    expect(result.caseNumber).toBe('CASE-2026-0001');
  });

  it('throws ForbiddenError for non-ADMIN actor (HOSPITAL role)', async () => {
    await expect(
      useCase.execute('case-id-1', 'hosp-1', hospitalActor),
    ).rejects.toThrow('Only admins can assign cases');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-case', 'hosp-1', adminActor),
    ).rejects.toThrow('Case nonexistent-case not found');
  });

  it('throws NotFoundError when hospital does not exist', async () => {
    mockHospitalRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('case-id-1', 'nonexistent-hosp', adminActor),
    ).rejects.toThrow('Hospital nonexistent-hosp not found');
  });

  it('throws ValidationError when hospital is not ACTIVE', async () => {
    mockHospitalRepo.findById = vi.fn().mockResolvedValue({
      id: 'hosp-inactive',
      name: 'Closed Hospital',
      status: 'INACTIVE',
    });

    await expect(
      useCase.execute('case-id-1', 'hosp-inactive', adminActor),
    ).rejects.toThrow('Hospital must be ACTIVE to receive case assignments');
  });

  it('does not create progress entry if case.assign() or save throws', async () => {
    mockCaseRepo.save = vi.fn().mockRejectedValue(new Error('DB error'));

    await expect(
      useCase.execute('case-id-1', 'hosp-1', adminActor),
    ).rejects.toThrow('DB error');

    expect(mockProgressRepo.save).not.toHaveBeenCalled();
  });
});
