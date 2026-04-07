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
  let emailService: {
    sendMagicLink: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.PATIENT_APP_ORIGIN;
    delete process.env.CHINA_ORIGIN;

    lookupRepo = {
      findEmailState: vi.fn(),
    };
    authService = {
      createPatientLoginToken: vi.fn().mockResolvedValue('patient-login-token'),
      createPatientRegisterToken: vi.fn().mockResolvedValue('patient-register-token'),
    };
    emailService = {
      sendMagicLink: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new SendPatientLoginLinkUseCase(lookupRepo as never, authService as never, emailService as never);
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
    expect(emailService.sendMagicLink).toHaveBeenCalledWith(
      'patient@test.com',
      'http://localhost:3000/dashboard?token=patient-login-token',
    );
  });

  it('creates a patient-register token for an unregistered email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({ state: 'NONE' });

    await expect(useCase.execute({ email: 'new@test.com' })).resolves.toMatchObject({
      delivery: 'register',
      token: 'patient-register-token',
    });
    expect(authService.createPatientRegisterToken).toHaveBeenCalledWith('new@test.com');
    expect(authService.createPatientLoginToken).not.toHaveBeenCalled();
    expect(emailService.sendMagicLink).toHaveBeenCalledWith(
      'new@test.com',
      'http://localhost:3000/free-quote?token=patient-register-token',
    );
  });

  it('prefers CHINA_ORIGIN when FRONTEND_URL is not configured', async () => {
    process.env.CHINA_ORIGIN = 'https://www.medicaltourismchina.health';
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'PATIENT',
      userId: 'patient-1',
    });

    await useCase.execute({ email: 'patient@test.com' });

    expect(emailService.sendMagicLink).toHaveBeenCalledWith(
      'patient@test.com',
      'https://www.medicaltourismchina.health/dashboard?token=patient-login-token',
    );
  });

  it('prefers PATIENT_APP_ORIGIN over CHINA_ORIGIN', async () => {
    process.env.CHINA_ORIGIN = 'https://www.medicaltourismchina.health';
    process.env.PATIENT_APP_ORIGIN = 'https://portal.medicaltourismchina.health';
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'PATIENT',
      userId: 'patient-1',
    });

    await useCase.execute({ email: 'patient@test.com' });

    expect(emailService.sendMagicLink).toHaveBeenCalledWith(
      'patient@test.com',
      'https://portal.medicaltourismchina.health/dashboard?token=patient-login-token',
    );
  });

  it('throws EMAIL_ROLE_CONFLICT for a hospital email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'HOSPITAL',
      userId: 'hospital-1',
    });

    await expect(useCase.execute({ email: 'hospital@test.com' })).rejects.toMatchObject({
      code: 'EMAIL_ROLE_CONFLICT',
    });
    expect(emailService.sendMagicLink).not.toHaveBeenCalled();
  });

  it('throws EMAIL_ROLE_CONFLICT for an admin email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'ADMIN',
      userId: 'admin-1',
    });

    await expect(useCase.execute({ email: 'admin@test.com' })).rejects.toMatchObject({
      code: 'EMAIL_ROLE_CONFLICT',
    });
    expect(emailService.sendMagicLink).not.toHaveBeenCalled();
  });
});
