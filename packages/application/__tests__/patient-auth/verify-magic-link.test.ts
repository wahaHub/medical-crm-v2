import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VerifyMagicLinkAuthError,
  VerifyMagicLinkUseCase,
} from '../../src/use-cases/patient-auth/verify-magic-link.use-case.js';

describe('VerifyMagicLinkUseCase', () => {
  let useCase: VerifyMagicLinkUseCase;
  let mockPatientRepo: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    mockAuthService = {
      createSessionToken: vi.fn().mockResolvedValue('session-token-xyz'),
      createGuestRestoreArtifacts: vi.fn().mockResolvedValue({
        restoreToken: 'restore-token-xyz',
        restoreCookie: 'restore-cookie-xyz',
      }),
      verifySessionToken: vi.fn(),
      createMagicLinkToken: vi.fn(),
      verifyMagicLinkToken: vi.fn().mockResolvedValue({
        email: 'test@example.com',
        site: 'beauty',
        purpose: 'patient-login',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };
    useCase = new VerifyMagicLinkUseCase(mockPatientRepo, mockAuthService);
  });

  it('verifies token and returns session token + restore artifacts + patientId', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'patient-1', patientCode: 'P001', preferredLanguage: 'en',
    });

    const result = await useCase.execute({ token: 'magic-token-abc', site: 'beauty' });

    expect(mockAuthService.verifyMagicLinkToken).toHaveBeenCalledWith('magic-token-abc', 'beauty');
    expect(mockPatientRepo.findByEmail).toHaveBeenCalledWith('test@example.com', 'beauty');
    expect(mockAuthService.createSessionToken).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(mockAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1', 'beauty');
    expect(result.sessionToken).toBe('session-token-xyz');
    expect(result.patientId).toBe('patient-1');
    expect(result.restoreToken).toBe('restore-token-xyz');
  });

  it('throws when patient not found for verified email', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'magic-token-abc', site: 'beauty' }))
      .rejects.toBeInstanceOf(VerifyMagicLinkAuthError);
  });

  it('throws when token is invalid', async () => {
    mockAuthService.verifyMagicLinkToken.mockRejectedValue(new Error('Invalid token'));

    await expect(useCase.execute({ token: 'bad-token', site: 'beauty' }))
      .rejects.toBeInstanceOf(VerifyMagicLinkAuthError);
  });

  it('rejects a token presented under the wrong site', async () => {
    mockAuthService.verifyMagicLinkToken.mockRejectedValue(new Error('Invalid token'));

    await expect(useCase.execute({ token: 'beauty-token', site: 'china' }))
      .rejects.toBeInstanceOf(VerifyMagicLinkAuthError);
  });
});
