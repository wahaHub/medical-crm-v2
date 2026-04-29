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
  const originalEnv = {
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    PATIENT_APP_ORIGIN: process.env.PATIENT_APP_ORIGIN,
  };

  beforeEach(() => {
    recipientRepo = {
      listAdminRecipients: vi.fn().mockResolvedValue([
        {
          id: 'admin-1',
          email: 'contact@medicaltourismchina.health',
          name: 'Contact Admin',
          role: 'ADMIN',
          notificationSettings: { newCase: true, newMessage: true, newTicket: true },
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
      releaseSlot: vi.fn().mockResolvedValue(undefined),
    };

    emailService = {
      sendHospitalInvitation: vi.fn(),
      sendPatientMagicLink: vi.fn(),
      sendPatientOnboardingConfirmation: vi.fn(),
      sendAdminNewCaseAlert: vi.fn(),
      sendAdminNewMessageAlert: vi.fn(),
      sendAdminNewTicketAlert: vi.fn(),
      sendPatientNewMessageAlert: vi.fn(),
      sendPatientCaseUpdateAlert: vi.fn(),
    };

    process.env.ADMIN_ORIGIN = 'https://admin.example.com';
    process.env.NODE_ENV = originalEnv.NODE_ENV;
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

  it('normalizes the configured admin origin in admin alert links', async () => {
    process.env.ADMIN_ORIGIN = 'https://admin.medicaltourismchina.health/';

    await service.notifyAdminsOfNewCase({
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      patientEmail: 'patient@example.com',
      site: 'china',
    });

    expect(emailService.sendAdminNewCaseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        adminPortalLink: 'https://admin.medicaltourismchina.health/cases/case-1',
      }),
    );
  });

  it('does not send localhost admin alert links in production when ADMIN_ORIGIN is missing', async () => {
    delete process.env.ADMIN_ORIGIN;
    process.env.NODE_ENV = 'production';

    await expect(service.notifyAdminsOfNewCase({
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      patientEmail: 'patient@example.com',
      site: 'china',
    })).rejects.toThrow('ADMIN_ORIGIN is required to generate admin notification links');
    expect(emailService.sendAdminNewCaseAlert).not.toHaveBeenCalled();
  });

  it('does not email admins who were active within the offline window', async () => {
    vi.mocked(recipientRepo.listAdminRecipients).mockResolvedValueOnce([
      {
        id: 'admin-1',
        email: 'contact@medicaltourismchina.health',
        name: 'Contact Admin',
        role: 'ADMIN',
        notificationSettings: { newCase: true, newMessage: true, newTicket: true },
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

  it('sends generic patient case-update alerts with their own cooldown slot', async () => {
    await service.notifyPatientOfCaseUpdate({
      caseId: 'case-1',
      patientId: 'patient-1',
      site: 'china',
      subject: 'Your treatment quote is ready',
      messagePreview: 'Your hospital uploaded a quote with multiple treatment items.',
      dedupeKey: 'quote:quote-1',
    });

    expect(cooldownRepo.tryAcquireSlot).toHaveBeenCalledWith({
      recipientId: 'patient-1',
      notificationKind: 'patient-case-update',
      dedupeKey: 'quote:quote-1',
      cooldownMs: 5 * 60 * 1000,
    });
    expect(emailService.sendPatientCaseUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'patient@example.com',
        patientName: 'Patient One',
        subject: 'Your treatment quote is ready',
        messagePreview: 'Your hospital uploaded a quote with multiple treatment items.',
        dashboardLink: 'https://www.medicaltourismchina.health/dashboard',
      }),
    );
  });

  it('passes the full body lines through for richer patient case-update emails', async () => {
    await service.notifyPatientOfCaseUpdate({
      caseId: 'case-1',
      patientId: 'patient-1',
      site: 'china',
      subject: 'Your personalized treatment plan',
      messagePreview: 'Line one of the outreach.\n\nLine two with next steps.',
      bodyLines: [
        'Line one of the outreach.',
        'Line two with next steps.',
      ],
      dedupeKey: 'marketing-email:case-1:plan',
    });

    expect(emailService.sendPatientCaseUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your personalized treatment plan',
        messagePreview: 'Line one of the outreach. Line two with next steps.',
        bodyLines: [
          'Line one of the outreach.',
          'Line two with next steps.',
        ],
      }),
    );
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

  it('shares one admin cooldown slot across case and message notifications for the same patient', async () => {
    vi.mocked(cooldownRepo.tryAcquireSlot)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await service.notifyAdminsOfNewCase({
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      patientEmail: 'patient@example.com',
      site: 'china',
    });

    await service.notifyAdminsOfPatientMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      messagePreview: 'Follow-up question right after signup',
    });

    expect(cooldownRepo.tryAcquireSlot).toHaveBeenNthCalledWith(1, {
      recipientId: 'admin-1',
      notificationKind: 'admin-patient-activity',
      dedupeKey: 'patient-1',
      cooldownMs: 5 * 60 * 1000,
    });
    expect(cooldownRepo.tryAcquireSlot).toHaveBeenNthCalledWith(2, {
      recipientId: 'admin-1',
      notificationKind: 'admin-patient-activity',
      dedupeKey: 'patient-1',
      cooldownMs: 5 * 60 * 1000,
    });
    expect(emailService.sendAdminNewCaseAlert).toHaveBeenCalledOnce();
    expect(emailService.sendAdminNewMessageAlert).not.toHaveBeenCalled();
  });

  it('releases the cooldown slot when email delivery fails after acquisition', async () => {
    vi.mocked(emailService.sendAdminNewCaseAlert).mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.notifyAdminsOfNewCase({
      caseId: 'case-1',
      patientId: 'patient-1',
      patientName: 'Patient One',
      patientEmail: 'patient@example.com',
      site: 'china',
    })).rejects.toThrow('smtp down');

    expect(cooldownRepo.releaseSlot).toHaveBeenCalledWith({
      recipientId: 'admin-1',
      notificationKind: 'admin-patient-activity',
      dedupeKey: 'patient-1',
    });
  });
});
