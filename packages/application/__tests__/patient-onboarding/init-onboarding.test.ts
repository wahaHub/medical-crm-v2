import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitOnboardingUseCase } from '../../src/use-cases/patient-onboarding/init-onboarding.use-case.js';

describe('InitOnboardingUseCase', () => {
  let useCase: InitOnboardingUseCase;
  let mockPatientRepo: any;
  let mockCaseRepo: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      createTempPatient: vi.fn().mockResolvedValue({
        id: 'patient-1', patientCode: null, preferredLanguage: 'en',
      }),
      updatePasswordHash: vi.fn(),
    };
    mockCaseRepo = {
      save: vi.fn().mockImplementation((c: any) => Promise.resolve(c)),
      nextCaseNumber: vi.fn().mockResolvedValue('CASE-2026-0001'),
      findById: vi.fn(),
      findMany: vi.fn(),
      countByFilters: vi.fn(),
    };
    mockAuthService = {
      createSessionToken: vi.fn().mockResolvedValue('jwt-token-123'),
      verifySessionToken: vi.fn(),
      createMagicLinkToken: vi.fn(),
      verifyMagicLinkToken: vi.fn(),
    };
    useCase = new InitOnboardingUseCase(mockPatientRepo, mockCaseRepo, mockAuthService);
  });

  it('creates a new patient and case when email is new', async () => {
    const result = await useCase.execute({
      email: 'new@test.com', name: 'New User', phone: '+1234', preferredLanguage: 'en',
    });
    expect(mockPatientRepo.createTempPatient).toHaveBeenCalledOnce();
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(result.token).toBe('jwt-token-123');
    expect(result.caseId).toBeDefined();
  });

  it('reuses existing patient when email exists', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'existing-1', patientCode: 'P001', preferredLanguage: 'zh',
    });
    const result = await useCase.execute({
      email: 'existing@test.com', name: 'Existing', phone: '+1234', preferredLanguage: 'zh',
    });
    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(result.patientId).toBe('existing-1');
    expect(result.isExistingPatient).toBe(true);
  });
});
