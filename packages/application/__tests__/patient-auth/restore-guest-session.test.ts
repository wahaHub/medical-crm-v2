import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestoreGuestSessionAuthError, RestoreGuestSessionUseCase } from '../../src/use-cases/patient-auth/restore-guest-session.use-case.js';

describe('RestoreGuestSessionUseCase', () => {
  let useCase: RestoreGuestSessionUseCase;
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
      createSessionToken: vi.fn().mockResolvedValue('session-token-new'),
      createGuestRestoreArtifacts: vi.fn().mockResolvedValue({
        restoreToken: 'restore-token-new',
        restoreCookie: 'restore-cookie-new',
      }),
      createGuestRestoreToken: vi.fn(),
      createGuestRestoreCookie: vi.fn(),
      verifySessionToken: vi.fn(),
      createMagicLinkToken: vi.fn(),
      verifyMagicLinkToken: vi.fn(),
      verifyGuestRestoreCookie: vi.fn().mockResolvedValue({
        userId: 'patient-1',
        purpose: 'guest-restore-cookie',
        restoreToken: 'restore-token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };
    useCase = new RestoreGuestSessionUseCase(mockPatientRepo, mockAuthService);
  });

  it('verifies restore token and cookie and rotates both session and restore artifacts', async () => {
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
    });

    const result = await useCase.execute({
      restoreToken: 'restore-token-abc',
      restoreCookie: 'restore-cookie-abc',
    });

    expect(mockAuthService.verifyGuestRestoreCookie).toHaveBeenCalledWith('restore-cookie-abc', 'restore-token-abc');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1');
    expect(mockAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
    expect(result).toEqual({
      patientId: 'patient-1',
      sessionToken: 'session-token-new',
      restoreToken: 'restore-token-new',
      restoreCookie: 'restore-cookie-new',
    });
  });

  it('throws when patient no longer exists', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ restoreToken: 'restore-token-abc', restoreCookie: 'restore-cookie-abc' }))
      .rejects.toThrow('Patient not found');
  });

  it('wraps restore artifact failures as auth errors', async () => {
    mockAuthService.verifyGuestRestoreCookie.mockRejectedValue(new Error('Restore token mismatch'));

    await expect(useCase.execute({ restoreToken: 'restore-token-abc', restoreCookie: 'restore-cookie-abc' }))
      .rejects.toBeInstanceOf(RestoreGuestSessionAuthError);
  });
});
