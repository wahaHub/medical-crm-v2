import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationEmailService } from '../src/use-cases/notifications/notification-email.service.js';
import type {
  IEmailNotificationCooldownRepository,
  INotificationRecipientRepository,
} from '@medical-crm/domain';
import type { IEmailService } from '@medical-crm/domain';

describe('NotificationEmailService', () => {
  let recipientRepo: INotificationRecipientRepository;
  let cooldownRepo: IEmailNotificationCooldownRepository;
  let emailService: IEmailService;
  let service: NotificationEmailService;

  beforeEach(() => {
    recipientRepo = {
      listAdminRecipients: vi.fn().mockResolvedValue([
        {
          id: 'admin-1',
          email: 'contact@medicaltourismchina.health',
          name: 'Contact Admin',
          role: 'ADMIN',
          notificationSettings: { newCase: true, newMessage: true },
          lastLoginAt: null,
        },
      ]),
      findRecipientById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        email: 'patient@example.com',
        name: 'Patient One',
        role: 'PATIENT',
        notificationSettings: null,
        lastLoginAt: null,
      }),
    };

    cooldownRepo = {
      tryAcquireSlot: vi.fn().mockResolvedValue(true),
    };

    emailService = {
      sendHospitalInvitation: vi.fn(),
      sendPatientMagicLink: vi.fn(),
      sendPatientOnboardingConfirmation: vi.fn(),
      sendAdminNewCaseAlert: vi.fn(),
      sendAdminNewMessageAlert: vi.fn(),
      sendAdminNewTicketAlert: vi.fn(),
      sendPatientNewMessageAlert: vi.fn(),
    };

    process.env.ADMIN_ORIGIN = 'https://admin.example.com';
    process.env.PATIENT_APP_ORIGIN = 'https://www.medicaltourismchina.health';

    service = new NotificationEmailService(
      recipientRepo,
      cooldownRepo,
      emailService,
    );
  });

  it('sends new-case alerts to offline admins only', async () => {
    await service.notifyAdminsOfNewCase({
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      patientEmail: 'patient@example.com',
      site: 'china',
    });

    expect(emailService.sendAdminNewCaseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'contact@medicaltourismchina.health',
        patientName: 'Patient One',
        patientEmail: 'patient@example.com',
        adminPortalLink: 'https://admin.example.com/cases/case-1',
      }),
    );
  });

  it('does not email admins who were active within the offline window', async () => {
    vi.mocked(recipientRepo.listAdminRecipients).mockResolvedValueOnce([
      {
        id: 'admin-1',
        email: 'contact@medicaltourismchina.health',
        name: 'Contact Admin',
        role: 'ADMIN',
        notificationSettings: { newCase: true, newMessage: true },
        lastLoginAt: new Date().toISOString(),
      },
    ]);

    await service.notifyAdminsOfPatientMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      messagePreview: 'Hello admin',
    });

    expect(emailService.sendAdminNewMessageAlert).not.toHaveBeenCalled();
  });

  it('does not send patient admin-reply email when the patient is online', async () => {
    await service.notifyPatientOfAdminMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      messagePreview: 'Your care advisor replied',
      site: 'china',
      isPatientOnline: true,
    });

    expect(emailService.sendPatientNewMessageAlert).not.toHaveBeenCalled();
  });

  it('suppresses duplicate emails when the cooldown slot is not acquired', async () => {
    vi.mocked(cooldownRepo.tryAcquireSlot).mockResolvedValueOnce(false);

    await service.notifyAdminsOfNewTicket({
      ticketId: 'ticket-1',
      ticketNumber: 'TKT-20260418-0001',
      patientId: 'patient-1',
      patientName: 'Patient One',
      subject: 'Need help',
      descriptionPreview: 'I need help with my case',
    });

    expect(emailService.sendAdminNewTicketAlert).not.toHaveBeenCalled();
  });
});
