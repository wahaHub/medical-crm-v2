import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyPatientEntryTokenUseCase } from '../../src/use-cases/patient-auth/verify-patient-entry-token.use-case.js';

describe('VerifyPatientEntryTokenUseCase', () => {
  let useCase: VerifyPatientEntryTokenUseCase;
  let authService: {
    verifyPatientEntryToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      verifyPatientEntryToken: vi.fn(),
    };

    useCase = new VerifyPatientEntryTokenUseCase(authService as never);
  });

  it('returns the verified patient-register token payload', async () => {
    authService.verifyPatientEntryToken.mockResolvedValue({
      email: 'new@test.com',
      purpose: 'patient-register',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(useCase.execute({ token: 'register-token' })).resolves.toMatchObject({
      email: 'new@test.com',
      purpose: 'patient-register',
    });
  });
});
