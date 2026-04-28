import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationEmailService } from '../src/use-cases/notifications/notification-email.service.js';
import type {
  IEmailNotificationCooldownRepository,
  IEmailReplyTokenRepository,
  IEmailService,
  INotificationRecipientRepository,
} from '@medical-crm/domain';
import { CreateEmailReplyTokenUseCase } from '../src/use-cases/notifications/create-email-reply-token.use-case.js';

describe('NotificationEmailService reply-to routing', () => {
  let recipientRepo: INotificationRecipientRepository;
  let cooldownRepo: IEmailNotificationCooldownRepository;
  let replyTokenRepo: IEmailReplyTokenRepository;
  let emailService: IEmailService;
  let createEmailReplyToken: CreateEmailReplyTokenUseCase;
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
    replyTokenRepo = {
      findByTokenHash: vi.fn().mockResolvedValue(null),
      findReusable: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (entity) => entity),
      markUsed: vi.fn().mockResolvedValue(undefined),
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
    createEmailReplyToken = new CreateEmailReplyTokenUseCase(replyTokenRepo);
    service = new NotificationEmailService(recipientRepo, cooldownRepo, emailService, {
      createEmailReplyToken,
    });
  });

  it('creates an admin-patient reply token for patient new-message emails', async () => {
    await service.notifyPatientOfAdminMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      messagePreview: 'Your care advisor replied',
      site: 'china',
      isPatientOnline: false,
      channel: 'ADMIN_PATIENT',
      sourceKind: 'message',
      sourceId: 'message-1',
    });

    expect(emailService.sendPatientNewMessageAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: expect.stringMatching(/^Medora Reply <reply\+[a-f0-9]{64}@medicaltourismchina\.health>$/),
      }),
    );
    expect(replyTokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      patientEmail: 'patient@example.com',
      channel: 'ADMIN_PATIENT',
      hospitalId: null,
      sourceKind: 'message',
      sourceId: 'message-1',
      status: 'ACTIVE',
    }));
  });

  it('creates a hospital-patient reply token for patient new-message emails', async () => {
    await service.notifyPatientOfAdminMessage({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      messagePreview: 'Your hospital replied',
      site: 'china',
      isPatientOnline: false,
      channel: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
      sourceKind: 'message',
      sourceId: 'message-2',
    });

    expect(emailService.sendPatientNewMessageAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: expect.stringMatching(/^Medora Reply <reply\+[a-f0-9]{64}@medicaltourismchina\.health>$/),
      }),
    );
    expect(replyTokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      patientEmail: 'patient@example.com',
      channel: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
      sourceKind: 'message',
      sourceId: 'message-2',
      status: 'ACTIVE',
    }));
  });

  it('creates a hospital-patient reply token for patient case-update emails', async () => {
    await service.notifyPatientOfCaseUpdate({
      caseId: 'case-1',
      patientId: 'patient-1',
      site: 'china',
      subject: 'Your care plan is ready',
      messagePreview: 'Review your latest plan.',
      conversationId: 'conv-1',
      channel: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
      sourceKind: 'document',
      sourceId: 'document-1',
    });

    expect(emailService.sendPatientCaseUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: expect.stringMatching(/^Medora Reply <reply\+[a-f0-9]{64}@medicaltourismchina\.health>$/),
      }),
    );
    expect(replyTokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      caseId: 'case-1',
      patientId: 'patient-1',
      patientEmail: 'patient@example.com',
      channel: 'HOSPITAL_PATIENT',
      hospitalId: 'hospital-1',
      sourceKind: 'document',
      sourceId: 'document-1',
      status: 'ACTIVE',
    }));
  });
});
