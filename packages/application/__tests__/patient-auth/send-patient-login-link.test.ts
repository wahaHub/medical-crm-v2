import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendPatientLoginLinkUseCase } from '../../src/use-cases/patient-auth/send-patient-login-link.use-case.js';
describe('SendPatientLoginLinkUseCase', () => {
  let useCase: SendPatientLoginLinkUseCase;
  let lookupRepo: {
    findEmailState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    lookupRepo = {
      findEmailState: vi.fn(),
    };

    useCase = new SendPatientLoginLinkUseCase(lookupRepo as never);
  });

  it('returns dashboard-login for an existing patient email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({
      state: 'PATIENT',
      userId: 'patient-1',
    });

    await expect(useCase.execute({ email: 'patient@test.com' })).resolves.toMatchObject({
      delivery: 'dashboard-login',
    });
  });

  it('returns register for an unregistered email', async () => {
    lookupRepo.findEmailState.mockResolvedValue({ state: 'NONE' });

    await expect(useCase.execute({ email: 'new@test.com' })).resolves.toMatchObject({
      delivery: 'register',
    });
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
