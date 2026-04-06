import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginWithPasswordUseCase } from '../../src/use-cases/patient-auth/login-with-password.use-case.js';

describe('LoginWithPasswordUseCase', () => {
  let useCase: LoginWithPasswordUseCase;
  let mockPatientRepo: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAuthByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    mockAuthService = {
      createSessionToken: vi.fn().mockResolvedValue('session-token-123'),
      createGuestRestoreArtifacts: vi.fn().mockResolvedValue({
        restoreToken: 'restore-token-123',
        restoreCookie: 'restore-cookie-123',
      }),
    };

    useCase = new LoginWithPasswordUseCase(mockPatientRepo, mockAuthService);
  });

  it('creates patient session artifacts when credentials are valid', async () => {
    const bcryptHash = '$2b$12$yT1zWZg6qz0n4j2wSxjX9u7D6sgRm1j0T4M2b6SMr8O5R7m2M6S1G';
    mockPatientRepo.findAuthByEmail.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
      passwordHash: await (await import('bcryptjs')).hash('SecurePass123', 12),
    });

    const result = await useCase.execute({
      email: 'patient@example.com',
      password: 'SecurePass123',
    });

    expect(result).toEqual({
      patientId: 'patient-1',
      sessionToken: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
    });
    expect(mockPatientRepo.findAuthByEmail).toHaveBeenCalledWith('patient@example.com');
    expect(mockAuthService.createSessionToken).toHaveBeenCalledWith('patient-1');
    expect(mockAuthService.createGuestRestoreArtifacts).toHaveBeenCalledWith('patient-1');
  });

  it('rejects when password is invalid', async () => {
    mockPatientRepo.findAuthByEmail.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
      passwordHash: await (await import('bcryptjs')).hash('SecurePass123', 12),
    });

    await expect(useCase.execute({
      email: 'patient@example.com',
      password: 'WrongPassword123',
    })).rejects.toThrow('Invalid credentials');
  });

  it('rejects when patient has no password set', async () => {
    mockPatientRepo.findAuthByEmail.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
      passwordHash: null,
    });

    await expect(useCase.execute({
      email: 'patient@example.com',
      password: 'SecurePass123',
    })).rejects.toThrow('Invalid credentials');
  });
});
