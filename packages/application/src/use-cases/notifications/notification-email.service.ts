import type {
  IEmailNotificationCooldownRepository,
  IEmailService,
  INotificationRecipientRepository,
  NotificationPreferences,
  PatientSite,
} from '@medical-crm/domain';
import { getPatientAppOrigin } from '../patient-auth/patient-app-origin.js';

const DEFAULT_OFFLINE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

type AdminNotificationRecipient = {
  id: string;
  email: string;
  name: string;
  preferredLanguage?: string | null;
  notificationSettings: NotificationPreferences | null;
  lastLoginAt: string | null;
};

function truncatePreview(value: string | null | undefined, maxLength = 180): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Open Medora to read the latest update.';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function wasRecentlyActive(lastLoginAt: string | null, offlineWindowMs: number): boolean {
  if (!lastLoginAt) return false;
  const timestamp = Date.parse(lastLoginAt);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < offlineWindowMs;
}

function preferenceEnabled(
  settings: NotificationPreferences | null,
  key: keyof NotificationPreferences,
): boolean {
  return settings?.[key] ?? true;
}

function getAdminOrigin(): string {
  return (process.env['ADMIN_ORIGIN'] ?? 'http://localhost:3002').replace(/\/+$/, '');
}

export class NotificationEmailService {
  private readonly offlineWindowMs: number;
  private readonly cooldownMs: number;

  constructor(
    private readonly recipientRepo: INotificationRecipientRepository,
    private readonly cooldownRepo: IEmailNotificationCooldownRepository,
    private readonly emailService: IEmailService,
    options?: {
      offlineWindowMs?: number;
      cooldownMs?: number;
    },
  ) {
    this.offlineWindowMs = options?.offlineWindowMs ?? DEFAULT_OFFLINE_WINDOW_MS;
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_EMAIL_COOLDOWN_MS;
  }

  async notifyAdminsOfNewCase(input: {
    caseId: string;
    patientId: string;
    patientName: string | null;
    patientEmail: string;
    site: PatientSite;
  }): Promise<void> {
    const recipients = await this.listOfflineAdmins('newCase');
    const patientName = input.patientName?.trim() || input.patientEmail;

    await Promise.all(recipients.map(async (recipient) => {
      await this.sendWithCooldown({
        recipientId: recipient.id,
        notificationKind: 'admin-new-case',
        dedupeKey: input.caseId,
        send: () => this.emailService.sendAdminNewCaseAlert({
          to: recipient.email,
          patientName,
          patientEmail: input.patientEmail,
          adminPortalLink: `${getAdminOrigin()}/cases/${input.caseId}`,
          locale: recipient.preferredLanguage ?? null,
        }),
      });
    }));
  }

  async notifyAdminsOfPatientMessage(input: {
    conversationId: string;
    caseId: string;
    patientId: string;
    patientName: string | null;
    messagePreview: string;
  }): Promise<void> {
    const recipients = await this.listOfflineAdmins('newMessage');
    const patient = await this.recipientRepo.findRecipientById(input.patientId);
    const patientName = input.patientName?.trim() || patient?.name?.trim() || patient?.email || 'A patient';
    const messagePreview = truncatePreview(input.messagePreview);

    await Promise.all(recipients.map(async (recipient) => {
      await this.sendWithCooldown({
        recipientId: recipient.id,
        notificationKind: 'admin-new-message',
        dedupeKey: input.conversationId,
        send: () => this.emailService.sendAdminNewMessageAlert({
          to: recipient.email,
          patientName,
          messagePreview,
          adminPortalLink: `${getAdminOrigin()}/cases/${input.caseId}`,
          locale: recipient.preferredLanguage ?? null,
        }),
      });
    }));
  }

  async notifyAdminsOfNewTicket(input: {
    ticketId: string;
    ticketNumber: string;
    patientId: string;
    patientName: string | null;
    subject: string | null;
    descriptionPreview: string;
  }): Promise<void> {
    const recipients = await this.listOfflineAdmins('newTicket');
    const patient = await this.recipientRepo.findRecipientById(input.patientId);
    const patientName = input.patientName?.trim() || patient?.name?.trim() || patient?.email || 'A patient';
    const subject = input.subject?.trim() || 'Support request';
    const descriptionPreview = truncatePreview(input.descriptionPreview);

    await Promise.all(recipients.map(async (recipient) => {
      await this.sendWithCooldown({
        recipientId: recipient.id,
        notificationKind: 'admin-new-ticket',
        dedupeKey: input.ticketId,
        send: () => this.emailService.sendAdminNewTicketAlert({
          to: recipient.email,
          ticketNumber: input.ticketNumber,
          patientName,
          subject,
          descriptionPreview,
          adminPortalLink: `${getAdminOrigin()}/tickets/${input.ticketId}`,
          locale: recipient.preferredLanguage ?? null,
        }),
      });
    }));
  }

  async notifyPatientOfAdminMessage(input: {
    conversationId: string;
    caseId: string;
    patientId: string;
    messagePreview: string;
    site: PatientSite;
    isPatientOnline: boolean;
  }): Promise<void> {
    if (input.isPatientOnline) {
      return;
    }

    const patient = await this.recipientRepo.findRecipientById(input.patientId);
    if (!patient || patient.role !== 'PATIENT' || !patient.email) {
      return;
    }

    await this.sendWithCooldown({
      recipientId: patient.id,
      notificationKind: 'patient-new-message',
      dedupeKey: input.conversationId,
      send: () => this.emailService.sendPatientNewMessageAlert({
        to: patient.email,
        patientName: patient.name || 'Patient',
        messagePreview: truncatePreview(input.messagePreview),
        dashboardLink: `${getPatientAppOrigin(patient.patientSite ?? input.site)}/dashboard`,
        locale: patient.preferredLanguage ?? null,
      }),
    });
  }

  private async listOfflineAdmins(
    preferenceKey: keyof NotificationPreferences,
  ): Promise<AdminNotificationRecipient[]> {
    const recipients = await this.recipientRepo.listAdminRecipients();
    return recipients.filter((recipient) =>
      preferenceEnabled(recipient.notificationSettings, preferenceKey)
      && !wasRecentlyActive(recipient.lastLoginAt, this.offlineWindowMs),
    );
  }

  private async sendWithCooldown(input: {
    recipientId: string;
    notificationKind: string;
    dedupeKey: string;
    send: () => Promise<void>;
  }): Promise<void> {
    const acquired = await this.cooldownRepo.tryAcquireSlot({
      recipientId: input.recipientId,
      notificationKind: input.notificationKind,
      dedupeKey: input.dedupeKey,
      cooldownMs: this.cooldownMs,
    });
    if (!acquired) {
      return;
    }

    try {
      await input.send();
    } catch (error) {
      await this.cooldownRepo.releaseSlot({
        recipientId: input.recipientId,
        notificationKind: input.notificationKind,
        dedupeKey: input.dedupeKey,
      });
      throw error;
    }
  }
}
