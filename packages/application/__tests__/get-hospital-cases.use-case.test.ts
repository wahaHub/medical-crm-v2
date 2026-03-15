import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetHospitalCasesUseCase } from '../src/use-cases/hospitals/get-hospital-cases.use-case.js';
import { ListCasesUseCase } from '../src/use-cases/cases/list-cases.use-case.js';
import type { IHospitalManagementRepository, ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import { Hospital, Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetHospitalCasesUseCase', () => {
  let useCase: GetHospitalCasesUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockCaseRepo: ICaseRepository;
  let listCasesUseCase: ListCasesUseCase;

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
    hospitalId: 'h-1',
  };

  const mockHospital = new Hospital({
    id: 'h-1',
    name: 'Test Hospital',
    nameEn: 'Test Hospital EN',
    address: '123 Main St',
    phone: '+1234567890',
    email: 'info@test.com',
    description: 'A test hospital',
    logoUrl: null,
    specialties: ['Cardiology'],
    status: 'ACTIVE',
    type: 'BEAUTY',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  });

  const mockCase = new Case({
    id: 'c-1',
    caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'p-1',
    patientName: 'Test Patient',
    patientCountry: null,
    patientLanguage: 'en',
    assignedHospitalId: 'h-1',
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
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const paginatedResult = {
    data: [mockCase],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
  };

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(mockHospital),
      findMany: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue(paginatedResult),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    listCasesUseCase = new ListCasesUseCase(mockCaseRepo);
    useCase = new GetHospitalCasesUseCase(mockHospitalRepo, listCasesUseCase);
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute('h-1', { page: 1, limit: 20 }, hospitalActor),
    ).rejects.toThrow('Only admins can list hospital cases');
  });

  it('throws NotFoundError when hospital does not exist', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', { page: 1, limit: 20 }, adminActor),
    ).rejects.toThrow('Hospital nonexistent not found');
  });

  it('validates hospital exists before delegating to ListCasesUseCase', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('h-1', { page: 1, limit: 20 }, adminActor),
    ).rejects.toThrow();

    expect(mockCaseRepo.findMany).not.toHaveBeenCalled();
  });

  it('delegates to ListCasesUseCase with hospitalId filter injected', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute('h-1', query, adminActor);

    expect(mockCaseRepo.findMany).toHaveBeenCalledWith(
      { page: 1, limit: 20, hospitalId: 'h-1' },
      undefined,
    );
  });

  it('passes additional query filters along with the hospitalId override', async () => {
    const query: CaseListQuery = { page: 2, limit: 10, status: 'ACTIVE' };
    await useCase.execute('h-1', query, adminActor);

    expect(mockCaseRepo.findMany).toHaveBeenCalledWith(
      { page: 2, limit: 10, status: 'ACTIVE', hospitalId: 'h-1' },
      undefined,
    );
  });

  it('returns paginated CaseDTO results from ListCasesUseCase', async () => {
    const result = await useCase.execute('h-1', { page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.caseNumber).toBe('CASE-2026-0001');
    expect(result.total).toBe(1);
  });

  it('calls findFullById with the provided hospital id', async () => {
    await useCase.execute('h-1', { page: 1, limit: 20 }, adminActor);

    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('h-1');
  });
});
