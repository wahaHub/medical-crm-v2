import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendMagicLinkUseCase } from '../../src/use-cases/patient-auth/send-magic-link.use-case.js';

describe('SendMagicLinkUseCase', () => {
  let useCase: SendMagicLinkUseCase;
  let mockPatientRepo: any;
  let mockAuthService: any;
  let mockEmailService: any;

  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.BEAUTY_ORIGIN;
    delete process.env.PATIENT_APP_ORIGIN;
    delete process.env.CHINA_ORIGIN;

    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    mockAuthService = {
      createSessionToken: vi.fn(),
      verifySessionToken: vi.fn(),
      createMagicLinkToken: vi.fn().mockResolvedValue('magic-token-abc'),
      verifyMagicLinkToken: vi.fn(),
    };
    mockEmailService = {
      sendMagicLink: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new SendMagicLinkUseCase(mockPatientRepo, mockAuthService, mockEmailService);
  });

  it('sends a magic link email when patient exists', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'patient-1', patientCode: 'P001', preferredLanguage: 'en',
    });

    await useCase.execute({ email: 'test@example.com', site: 'beauty' });

    expect(mockPatientRepo.findByEmail).toHaveBeenCalledWith('test@example.com', 'beauty');
    expect(mockAuthService.createMagicLinkToken).toHaveBeenCalledWith('test@example.com', 'beauty');
    expect(mockEmailService.sendMagicLink).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('magic-token-abc'),
      'en',
    );
  });

  it('prefers CHINA_ORIGIN when FRONTEND_URL is not configured', async () => {
    process.env.CHINA_ORIGIN = 'https://www.medicaltourismchina.health';
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'patient-1', patientCode: 'P001', preferredLanguage: 'en',
    });

    await useCase.execute({ email: 'test@example.com', site: 'china' });

    expect(mockEmailService.sendMagicLink).toHaveBeenCalledWith(
      'test@example.com',
      'https://www.medicaltourismchina.health/dashboard?token=magic-token-abc',
      'en',
    );
  });

  it('silently does nothing when patient does not exist (no email leak)', async () => {
    mockPatientRepo.findByEmail.mockResolvedValue(null);

    await useCase.execute({ email: 'nonexistent@example.com', site: 'beauty' });

    expect(mockAuthService.createMagicLinkToken).not.toHaveBeenCalled();
    expect(mockEmailService.sendMagicLink).not.toHaveBeenCalled();
  });
});
