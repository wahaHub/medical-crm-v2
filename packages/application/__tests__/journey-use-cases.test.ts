import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCaseJourneyUseCase } from '../src/use-cases/journey/get-case-journey.use-case.js';
import { UpdateCaseJourneyUseCase } from '../src/use-cases/journey/update-case-journey.use-case.js';
import { ListMilestonesUseCase } from '../src/use-cases/journey/list-milestones.use-case.js';
import { CreateMilestoneUseCase } from '../src/use-cases/journey/create-milestone.use-case.js';
import { UpdateMilestoneUseCase } from '../src/use-cases/journey/update-milestone.use-case.js';
import { DeleteMilestoneUseCase } from '../src/use-cases/journey/delete-milestone.use-case.js';
import { CaseJourney, JourneyMilestone, Case, CaseNumber } from '@medical-crm/domain';
import type { ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';

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

const otherHospitalActor: Actor = {
  userId: 'hospital-user-2',
  email: 'other@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-2',
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

const otherPatientActor: Actor = {
  userId: 'patient-2',
  email: 'other-patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

// ——— Factories ———
function makeCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}): Case {
  return new Case({
    id: 'case-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'patient-1',
    assignedHospitalId: 'hosp-1',
    patientName: 'Test Patient',
    patientCountry: 'US',
    patientLanguage: 'en',
    primaryDiagnosis: null,
    diagnosisCode: null,
    symptoms: null,
    medicalHistory: null,
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'IN_TREATMENT',
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    assignmentStatus: 'ASSIGNED',
    treatmentStage: 'IN_TREATMENT',
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

function makeJourney(overrides: Partial<ConstructorParameters<typeof CaseJourney>[0]> = {}): CaseJourney {
  return new CaseJourney({
    id: 'journey-1',
    caseId: 'case-1',
    visa: null,
    insurance: null,
    accommodation: null,
    transportation: null,
    postCare: null,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function makeMilestone(overrides: Partial<ConstructorParameters<typeof JourneyMilestone>[0]> = {}): JourneyMilestone {
  return new JourneyMilestone({
    id: 'milestone-1',
    caseId: 'case-1',
    eventType: 'SURGERY_DATE',
    eventDate: new Date('2026-04-15'),
    note: 'Main procedure',
    isVisibleToPatient: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

// ——— Mock repos ———
function mockCaseRepo(): ICaseRepository {
  return {
    findById: vi.fn(),
    findMany: vi.fn(),
    findByPatientId: vi.fn(),
    save: vi.fn(),
    nextCaseNumber: vi.fn(),
    countByFilters: vi.fn(),
  };
}

function mockJourneyRepo(): IJourneyRepository {
  return {
    findJourneyByCaseId: vi.fn(),
    saveJourney: vi.fn(),
    findMilestoneById: vi.fn(),
    findMilestonesByCaseId: vi.fn(),
    saveMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
  };
}

// ============================================================================
// GetCaseJourneyUseCase
// ============================================================================
describe('GetCaseJourneyUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: GetCaseJourneyUseCase;

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    caseRepo = mockCaseRepo();
    uc = new GetCaseJourneyUseCase(journeyRepo, caseRepo);
  });

  it('returns journey for admin', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeJourney());
    const result = await uc.execute('case-1', adminActor);
    expect(result).not.toBeNull();
    expect(result!.caseId).toBe('case-1');
  });

  it('returns null when no journey exists', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await uc.execute('case-1', adminActor);
    expect(result).toBeNull();
  });

  it('throws for non-existent case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-999', adminActor)).rejects.toThrow('Case case-999 not found');
  });

  it('allows hospital actor for assigned case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeJourney());
    const result = await uc.execute('case-1', hospitalActor);
    expect(result).not.toBeNull();
  });

  it('rejects hospital actor for unassigned case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherHospitalActor)).rejects.toThrow('Hospital can only access');
  });

  it('allows patient to view own case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeJourney());
    const result = await uc.execute('case-1', patientActor);
    expect(result).not.toBeNull();
  });

  it('does not apply staff example.com exclusion to patient self-service', async () => {
    const userRepo = {
      findById: vi.fn().mockRejectedValue(new Error('patient email should not be loaded')),
    };
    const adminAccess = new AdminPatientSiteAccessPolicy({ findById: vi.fn() } as never, userRepo as never);
    uc = new GetCaseJourneyUseCase(journeyRepo, caseRepo, undefined, adminAccess);
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(makeJourney());

    const result = await uc.execute('case-1', patientActor);

    expect(result).not.toBeNull();
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects patient for other case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherPatientActor)).rejects.toThrow('Patient can only access');
  });
});

// ============================================================================
// UpdateCaseJourneyUseCase
// ============================================================================
describe('UpdateCaseJourneyUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: UpdateCaseJourneyUseCase;

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    caseRepo = mockCaseRepo();
    uc = new UpdateCaseJourneyUseCase(journeyRepo, caseRepo);
  });

  it('creates new journey when none exists (upsert)', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (journeyRepo.saveJourney as ReturnType<typeof vi.fn>).mockImplementation(async (j: CaseJourney) => j);

    const result = await uc.execute('case-1', { visa: { status: 'approved' } }, adminActor);
    expect(result.visa).toEqual({ status: 'approved' });
    expect(journeyRepo.saveJourney).toHaveBeenCalledOnce();
  });

  it('updates existing journey', async () => {
    const existing = makeJourney({ visa: { old: true } });
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findJourneyByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (journeyRepo.saveJourney as ReturnType<typeof vi.fn>).mockImplementation(async (j: CaseJourney) => j);

    const result = await uc.execute('case-1', { visa: { new: true } }, adminActor);
    expect(result.visa).toEqual({ new: true });
  });

  it('rejects non-admin actors', async () => {
    await expect(uc.execute('case-1', {}, hospitalActor)).rejects.toThrow('Only admins');
    await expect(uc.execute('case-1', {}, patientActor)).rejects.toThrow('Only admins');
  });

  it('throws for non-existent case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-999', {}, adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// ListMilestonesUseCase
// ============================================================================
describe('ListMilestonesUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: ListMilestonesUseCase;

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    caseRepo = mockCaseRepo();
    uc = new ListMilestonesUseCase(journeyRepo, caseRepo);
  });

  it('returns all milestones for admin', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    const milestones = [makeMilestone(), makeMilestone({ id: 'ms-2', isVisibleToPatient: false })];
    (journeyRepo.findMilestonesByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue(milestones);

    const result = await uc.execute('case-1', adminActor);
    expect(result).toHaveLength(2);
    expect(journeyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', { visibleOnly: false });
  });

  it('returns only visible milestones for patient', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findMilestonesByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([makeMilestone()]);

    await uc.execute('case-1', patientActor);
    expect(journeyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', { visibleOnly: true });
  });

  it('returns all milestones for assigned hospital', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.findMilestonesByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await uc.execute('case-1', hospitalActor);
    expect(journeyRepo.findMilestonesByCaseId).toHaveBeenCalledWith('case-1', { visibleOnly: false });
  });

  it('rejects unassigned hospital', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherHospitalActor)).rejects.toThrow('Hospital can only access');
  });

  it('rejects other patient', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', otherPatientActor)).rejects.toThrow('Patient can only access');
  });
});

// ============================================================================
// CreateMilestoneUseCase
// ============================================================================
describe('CreateMilestoneUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let caseRepo: ReturnType<typeof mockCaseRepo>;
  let uc: CreateMilestoneUseCase;

  const validInput = {
    eventType: 'SURGERY_DATE',
    eventDate: '2026-04-15T00:00:00.000Z',
    note: 'Main procedure',
    isVisibleToPatient: true,
  };

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    caseRepo = mockCaseRepo();
    uc = new CreateMilestoneUseCase(journeyRepo, caseRepo);
  });

  it('admin creates a milestone', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.saveMilestone as ReturnType<typeof vi.fn>).mockImplementation(async (m: JourneyMilestone) => m);

    const result = await uc.execute('case-1', validInput, adminActor);
    expect(result.eventType).toBe('SURGERY_DATE');
    expect(result.caseId).toBe('case-1');
    expect(result.createdBy).toBe('admin-1');
  });

  it('assigned hospital creates a milestone', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    (journeyRepo.saveMilestone as ReturnType<typeof vi.fn>).mockImplementation(async (m: JourneyMilestone) => m);

    const result = await uc.execute('case-1', validInput, hospitalActor);
    expect(result.createdBy).toBe('hospital-user-1');
  });

  it('rejects unassigned hospital', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase());
    await expect(uc.execute('case-1', validInput, otherHospitalActor)).rejects.toThrow('Hospital can only create');
  });

  it('rejects patient', async () => {
    await expect(uc.execute('case-1', validInput, patientActor)).rejects.toThrow('Patients cannot create');
  });

  it('throws for non-existent case', async () => {
    (caseRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('case-999', validInput, adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// UpdateMilestoneUseCase
// ============================================================================
describe('UpdateMilestoneUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let uc: UpdateMilestoneUseCase;

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    uc = new UpdateMilestoneUseCase(journeyRepo);
  });

  it('admin updates a milestone', async () => {
    (journeyRepo.findMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMilestone());
    (journeyRepo.saveMilestone as ReturnType<typeof vi.fn>).mockImplementation(async (m: JourneyMilestone) => m);

    const result = await uc.execute('milestone-1', { note: 'Updated' }, adminActor);
    expect(result.note).toBe('Updated');
  });

  it('rejects non-admin', async () => {
    await expect(uc.execute('milestone-1', { note: 'x' }, hospitalActor)).rejects.toThrow('Only admins');
    await expect(uc.execute('milestone-1', { note: 'x' }, patientActor)).rejects.toThrow('Only admins');
  });

  it('throws for non-existent milestone', async () => {
    (journeyRepo.findMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('ms-999', { note: 'x' }, adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// DeleteMilestoneUseCase
// ============================================================================
describe('DeleteMilestoneUseCase', () => {
  let journeyRepo: ReturnType<typeof mockJourneyRepo>;
  let uc: DeleteMilestoneUseCase;

  beforeEach(() => {
    journeyRepo = mockJourneyRepo();
    uc = new DeleteMilestoneUseCase(journeyRepo);
  });

  it('admin deletes a milestone', async () => {
    (journeyRepo.findMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMilestone());
    (journeyRepo.deleteMilestone as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await uc.execute('milestone-1', adminActor);
    expect(journeyRepo.deleteMilestone).toHaveBeenCalledWith('milestone-1');
  });

  it('rejects non-admin', async () => {
    await expect(uc.execute('milestone-1', hospitalActor)).rejects.toThrow('Only admins');
    await expect(uc.execute('milestone-1', patientActor)).rejects.toThrow('Only admins');
  });

  it('throws for non-existent milestone', async () => {
    (journeyRepo.findMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute('ms-999', adminActor)).rejects.toThrow('not found');
  });
});
