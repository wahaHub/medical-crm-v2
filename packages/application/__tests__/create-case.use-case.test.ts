import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCaseUseCase } from '../src/use-cases/cases/create-case.use-case.js';
import type { ICaseRepository } from '@medical-crm/domain';
import { Case, CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('CreateCaseUseCase', () => {
  let useCase: CreateCaseUseCase;
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
    hospitalId: 'h-1',
  };

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Case) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn().mockResolvedValue(CaseNumber.generate(2026, 1)),
      countByFilters: vi.fn(),
    };
    useCase = new CreateCaseUseCase(mockCaseRepo);
  });

  it('creates a case with DRAFT status and PENDING_ASSIGNMENT stage', async () => {
    const result = await useCase.execute({
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientLanguage: 'en',
    }, adminActor);

    expect(result.status).toBe('DRAFT');
    expect(result.stage).toBe('PENDING_ASSIGNMENT');
    expect(result.caseNumber).toBe('CASE-2026-0001');
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute({ patientId: 'p-1', patientName: 'Test' }, hospitalActor),
    ).rejects.toThrow('Only admins can create cases');
  });

  it('passes optional fields to the DTO', async () => {
    const result = await useCase.execute({
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: 'US',
      patientLanguage: 'en',
      primaryDiagnosis: 'Rhinoplasty consultation',
      symptoms: ['nasal obstruction'],
      medicalHistory: 'No prior surgeries',
    }, adminActor);

    expect(result.primaryDiagnosis).toBe('Rhinoplasty consultation');
  });

  it('returns CaseDTO format', async () => {
    const result = await useCase.execute({
      patientId: 'patient-1',
      patientName: 'John Doe',
    }, adminActor);

    // CaseDTO should have string dates, not Date objects
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });
});
