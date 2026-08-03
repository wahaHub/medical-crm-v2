import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEmailService, IUserRepository } from '@medical-crm/domain';
import { SendRecordsUploadConfirmationUseCase } from './send-records-upload-confirmation.use-case.js';

describe('SendRecordsUploadConfirmationUseCase', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalChinaOrigin = process.env['CHINA_ORIGIN'];
  let userRepo: IUserRepository;
  let emailService: IEmailService;

  beforeEach(() => {
    process.env['NODE_ENV'] = 'production';
    process.env['CHINA_ORIGIN'] = 'https://www.medicaltourismchina.health';
    userRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        email: 'patient@example.com',
        name: 'Patient One',
        role: 'PATIENT',
        phone: null,
        patientSite: 'china',
        preferredLanguage: 'en',
        hospitalId: null,
        notificationSettings: null,
      }),
      findByEmail: vi.fn(),
      update: vi.fn(),
      listAdminEmails: vi.fn(),
      listHospitalEmails: vi.fn(),
    };
    emailService = {
      sendHospitalInvitation: vi.fn(),
      sendHospitalPasswordReset: vi.fn(),
      sendPatientMagicLink: vi.fn(),
      sendPatientOnboardingConfirmation: vi.fn(),
      sendPatientRecordsUploadConfirmation: vi.fn(),
      sendAdminNewCaseAlert: vi.fn(),
      sendAdminNewMessageAlert: vi.fn(),
      sendAdminNewTicketAlert: vi.fn(),
      sendPatientNewMessageAlert: vi.fn(),
      sendPatientCaseUpdateAlert: vi.fn(),
    };
  });

  it('sends the confirmation to the patient profile email', async () => {
    const useCase = new SendRecordsUploadConfirmationUseCase(userRepo, emailService);

    await useCase.execute({
      patientId: 'patient-1',
      site: 'china',
      fileName: 'report.pdf',
      locale: 'en',
    });

    expect(emailService.sendPatientRecordsUploadConfirmation).toHaveBeenCalledWith({
      to: 'patient@example.com',
      patientName: 'Patient One',
      fileName: 'report.pdf',
      dashboardLink: 'https://www.medicaltourismchina.health/dashboard',
      locale: 'en',
    });
  });

  it('fails clearly when the patient profile no longer exists', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);
    const useCase = new SendRecordsUploadConfirmationUseCase(userRepo, emailService);

    await expect(useCase.execute({
      patientId: 'missing-patient',
      site: 'china',
      fileName: 'report.pdf',
    })).rejects.toThrow('Patient not found');
    expect(emailService.sendPatientRecordsUploadConfirmation).not.toHaveBeenCalled();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalChinaOrigin === undefined) delete process.env['CHINA_ORIGIN'];
    else process.env['CHINA_ORIGIN'] = originalChinaOrigin;
  });
});
