import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCaseUseCase } from '../src/use-cases/cases/get-case.use-case.js';
import { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';
import type { ICaseRepository, IUserRepository, IHospitalRepository, ICHCRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetCaseUseCase', () => {
  let useCase: GetCaseUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockUserRepo: IUserRepository;
  let mockHospitalRepo: IHospitalRepository;
  let mockChcRepo: ICHCRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'contact@medorabeauty.com',
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
    structuredData: {
      entryProfile: {
        department: 'Oculoplastic Surgery',
        disease: 'Ptosis',
      },
    },
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date('2026-01-15T10:00:00Z'),
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    assignmentStatus: 'ASSIGNED',
    treatmentStage: null,
    conditionSummary: null,
    riskFlags: null,
    priority: null,
    lastEventAt: null,
    aiSummaryStatus: 'PENDING',
    questionCollectorTemplateId: null,
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(mockCase),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    mockUserRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        email: 'jane@patient.test',
        phone: '+8613800000000',
        patientSite: 'beauty',
      }),
      listAdminEmails: vi.fn(),
    } as unknown as IUserRepository;
    mockHospitalRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'hosp-1',
        name: 'Beijing Eye Center',
        status: 'ACTIVE',
        type: 'COSMETIC',
      }),
    } as unknown as IHospitalRepository;
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };
    useCase = new GetCaseUseCase(
      mockCaseRepo,
      mockUserRepo,
      mockHospitalRepo,
      mockChcRepo,
      new AdminPatientSiteAccessPolicy(mockCaseRepo, mockUserRepo),
    );
  });

  it('returns CaseDTO for ADMIN actor', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.id).toBe('case-id-1');
    expect(result.caseNumber).toBe('CASE-2026-0042');
    expect(result.patientName).toBe('Jane Doe');
    expect(result.patientPhone).toBe('+8613800000000');
    expect(result.department).toBe('Oculoplastic Surgery');
    expect(result.disease).toBe('Ptosis');
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

  it('allows a hospital actor with an active hospital contact to access the case', async () => {
    (mockChcRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-id-1',
      hospitalId: 'hosp-2',
      subStatus: 'QUOTED',
      removedAt: null,
    });

    const result = await useCase.execute('case-id-1', otherHospitalActor);

    expect(result.id).toBe('case-id-1');
    expect(mockChcRepo.findByCaseAndHospital).toHaveBeenCalledWith('case-id-1', 'hosp-2');
  });

  it('rejects hospital access when the hospital contact is no longer portal-visible', async () => {
    (mockChcRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-id-1',
      hospitalId: 'hosp-2',
      subStatus: 'REJECTED',
      removedAt: null,
    });

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

  it('treats example.com patient cases as not found for direct detail access', async () => {
    (mockUserRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'patient-1',
      email: 'jane@example.com',
      phone: '+8613800000000',
      patientSite: 'beauty',
    });

    await expect(
      useCase.execute('case-id-1', adminActor),
    ).rejects.toThrow('Case case-id-1 not found');
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

  it('maps patient site and derived hospital type from the patient profile', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.patientSite).toBe('beauty');
    expect(result.hospitalType).toBe('COSMETIC');
  });
});
