import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendPatientOnboardingEmailUseCase } from '../../src/use-cases/patient-auth/send-patient-onboarding-email.use-case.js';

describe('SendPatientOnboardingEmailUseCase', () => {
  let useCase: SendPatientOnboardingEmailUseCase;
  let authService: {
    createPatientLoginToken: ReturnType<typeof vi.fn>;
  };
  let emailService: {
    sendOnboardingEmail: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.BEAUTY_ORIGIN;
    delete process.env.PATIENT_APP_ORIGIN;
    delete process.env.CHINA_ORIGIN;

    authService = {
      createPatientLoginToken: vi.fn().mockResolvedValue('patient-login-token'),
    };
    emailService = {
      sendOnboardingEmail: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new SendPatientOnboardingEmailUseCase(authService as never, emailService as never);
  });

  it('sends the onboarding confirmation email with a dashboard link and case summary', async () => {
    process.env.CHINA_ORIGIN = 'https://www.medicaltourismchina.health';

    await expect(useCase.execute({
      email: 'new@test.com',
      site: 'china',
      locale: 'en',
      summary: {
        country: 'Thailand',
        department: 'Dentistry & Oral-Maxillofacial Surgery',
        condition: '肚子疼肚子疼',
        destination: 'Shenzhen',
        treatmentTimeline: '3-6 months',
      },
    })).resolves.toEqual({ token: 'patient-login-token' });

    expect(authService.createPatientLoginToken).toHaveBeenCalledWith('new@test.com', 'china');
    expect(emailService.sendOnboardingEmail).toHaveBeenCalledWith({
      email: 'new@test.com',
      dashboardLink: 'https://www.medicaltourismchina.health/dashboard?token=patient-login-token',
      locale: 'en',
      summary: {
        country: 'Thailand',
        department: 'Dentistry & Oral-Maxillofacial Surgery',
        condition: '肚子疼肚子疼',
        destination: 'Shenzhen',
        treatmentTimeline: '3-6 months',
      },
    });
  });
});
