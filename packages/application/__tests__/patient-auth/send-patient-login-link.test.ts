import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendPatientLoginLinkUseCase } from '../../src/use-cases/patient-auth/send-patient-login-link.use-case.js';

describe('SendPatientLoginLinkUseCase', () => {
  let useCase: SendPatientLoginLinkUseCase;
  let lookupRepo: {
    findEmailState: ReturnType<typeof vi.fn>;
  };
  let authService: {
    createPatientLoginToken: ReturnType<typeof vi.fn>;
    createPatientRegisterToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    lookupRepo = {
      findEmailState: vi.fn(),
    };
    authService = {
      createPatientLoginToken: vi.fn().mockResolvedValue('patient-login-token'),
      createPatientRegisterToken: vi.fn().mockResolvedValue('patient-register-token'),
    };

    useCase = new SendPatientLoginLinkUseCase(lookupRepo as never, authService as never);
  });

  it('creates a patient-login token for an existing patient email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'PATIENT',
      userId: 'patient-1',
    });

    await expect(useCase.execute({ email: 'patient@test.com' })).resolves.toMatchObject({
      delivery: 'dashboard-login',
      token: 'patient-login-token',
    });
    expect(authService.createPatientLoginToken).toHaveBeenCalledWith('patient@test.com');
    expect(authService.createPatientRegisterToken).not.toHaveBeenCalled();
  });

  it('creates a patient-register token for an unregistered email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({ state: 'NONE' });

    await expect(useCase.execute({ email: 'new@test.com' })).resolves.toMatchObject({
      delivery: 'register',
      token: 'patient-register-token',
    });
    expect(authService.createPatientRegisterToken).toHaveBeenCalledWith('new@test.com');
    expect(authService.createPatientLoginToken).not.toHaveBeenCalled();
  });

  it('throws EMAIL_ROLE_CONFLICT for a hospital email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'HOSPITAL',
      userId: 'hospital-1',
    });

    await expect(useCase.execute({ email: 'hospital@test.com' })).rejects.toMatchObject({
      code: 'EMAIL_ROLE_CONFLICT',
    });
  });

  it('throws EMAIL_ROLE_CONFLICT for an admin email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'ADMIN',
      userId: 'admin-1',
    });

    await expect(useCase.execute({ email: 'admin@test.com' })).rejects.toMatchObject({
      code: 'EMAIL_ROLE_CONFLICT',
    });
  });
});
