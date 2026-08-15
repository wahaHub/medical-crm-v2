import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCasesUseCase } from '../src/use-cases/cases/list-cases.use-case.js';
import type { ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { Case, CaseNumber } from '@medical-crm/domain';

describe('ListCasesUseCase', () => {
  let useCase: ListCasesUseCase;
  let mockCaseRepo: ICaseRepository;

  const adminActor: Actor = { userId: 'a-1', email: 'a@t.com', role: 'ADMIN', hospitalId: null };
  const beautyAdminActor: Actor = { userId: 'a-2', email: 'contact@medorabeauty.com', role: 'ADMIN', hospitalId: null };
  const hospitalActor: Actor = { userId: 'h-1', email: 'h@t.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };

  const mockCase = new Case({
    id: 'c-1', caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'p-1', patientName: 'Test', patientCountry: null, patientLanguage: 'en',
    assignedHospitalId: 'hosp-1', primaryDiagnosis: null, diagnosisCode: null,
    symptoms: null, medicalHistory: null, aiSummary: null, aiSummaryLanguage: null,
    riskLevel: null, status: 'ACTIVE', stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue({
        data: [mockCase], total: 1, page: 1, limit: 20, totalPages: 1, hasMore: false,
      }),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    useCase = new ListCasesUseCase(mockCaseRepo);
  });

  it('forces hospitalId filter for HOSPITAL actor', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, hospitalActor);
    expect(mockCaseRepo.findMany).toHaveBeenCalledWith({
      ...query,
      excludedPatientEmailDomains: ['example.com'],
    }, 'hosp-1');
  });

  it('does not force hospitalId for ADMIN actor', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, adminActor);
    expect(mockCaseRepo.findMany).toHaveBeenCalledWith({
      ...query,
      excludedPatientEmailDomains: ['example.com'],
      patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' },
    }, undefined);
  });

  it('passes beauty-only patient-site scope for medorabeauty admin', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, beautyAdminActor);
    expect(mockCaseRepo.findMany).toHaveBeenCalledWith({
      ...query,
      excludedPatientEmailDomains: ['example.com'],
      patientSiteScope: { mode: 'ONLY', site: 'beauty' },
    }, undefined);
  });

  it('returns paginated CaseDTO results', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.caseNumber).toBe('CASE-2026-0001');
  });

  it('uses persisted list labels without an AI call', async () => {
    mockCase.listDiseaseLabel = 'Knee osteoarthritis';
    mockCase.listCountryLabel = 'China';
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.data[0]).toMatchObject({ disease: 'Knee osteoarthritis', country: 'China' });
  });
});
