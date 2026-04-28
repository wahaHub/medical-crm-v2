import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationEmailService } from '../src/use-cases/notifications/notification-email.service.js';
import type {
  IEmailNotificationCooldownRepository,
  IEmailService,
  INotificationRecipientRepository,
} from '@medical-crm/domain';

describe('NotificationEmailService reply-to routing', () => {
  let recipientRepo: INotificationRecipientRepository;
  let cooldownRepo: IEmailNotificationCooldownRepository;
  let emailService: IEmailService;
  let service: NotificationEmailService;

  beforeEach(() => {
    recipientRepo = {
      listAdminRecipients: vi.fn().mockResolvedValue([]),
      findRecipientById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        email: 'patient@example.com',
        name: 'Patient One',
        role: 'PATIENT',
        notificationSettings: null,
        lastLoginAt: null,
        patientSite: 'china',
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
    process.env.PATIENT_APP_ORIGIN = 'https://www.medicaltourismchina.health';
    service = new NotificationEmailService(recipientRepo, cooldownRepo, emailService);
  });

  it('passes replyTo through patient new-message emails', async () => {
    const replyTo = 'reply+0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@medicaltourismchina.health';

    await service.notifyPatientOfAdminMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      messagePreview: 'Your care advisor replied',
      site: 'china',
      isPatientOnline: false,
      replyTo,
    });

    expect(emailService.sendPatientNewMessageAlert).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo }),
    );
  });

  it('passes replyTo through patient case-update emails', async () => {
    const replyTo = 'reply+0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@medicaltourismchina.health';

    await service.notifyPatientOfCaseUpdate({
      caseId: 'case-1',
      patientId: 'patient-1',
      site: 'china',
      subject: 'Your care plan is ready',
      messagePreview: 'Review your latest plan.',
      replyTo,
    });

    expect(emailService.sendPatientCaseUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo }),
    );
  });
});
