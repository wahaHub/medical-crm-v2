import nodemailer, { type Transporter } from 'nodemailer';
import type { IEmailService } from '@medical-crm/domain';
import { buildHospitalInvitationEmail } from './hospital-invitation-email.template.js';
import { buildPatientMagicLinkEmail } from './patient-magic-link-email.template.js';
import { buildPatientOnboardingEmail } from './patient-onboarding-email.template.js';
import { buildAdminNewCaseEmail } from './admin-new-case-email.template.js';
import { buildAdminNewMessageEmail } from './admin-new-message-email.template.js';
import { buildAdminNewTicketEmail } from './admin-new-ticket-email.template.js';
import { buildPatientNewMessageEmail } from './patient-new-message-email.template.js';

const PATIENT_NOTIFICATION_FROM = 'Medora Care Team <customer@medicaltourismchina.health>';

function formatPatientReplyTo(replyTo: string | null | undefined): string | undefined {
  const trimmed = replyTo?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('<')) return trimmed;
  return `Medora Reply <${trimmed}>`;
}

function readSmtpConfig() {
  const host = process.env['SMTP_HOST'] ?? process.env['AWS_SES_SMTP_HOST'];
  const user = process.env['SMTP_USER'] ?? process.env['AWS_SES_SMTP_USER'];
  const pass = process.env['SMTP_PASS'] ?? process.env['AWS_SES_SMTP_PASS'];

  if (!host || !user || !pass) return null;

  const rawPort = process.env['SMTP_PORT'] ?? process.env['AWS_SES_SMTP_PORT'] ?? '587';
  const port = Number.parseInt(rawPort, 10);
  const rawSecure =
    process.env['SMTP_SECURE'] ??
    process.env['AWS_SES_SMTP_SECURE'] ??
    (port === 465 ? 'true' : 'false');
  const secure = rawSecure.toLowerCase() === 'true';
  const from = process.env['SMTP_FROM'] ?? process.env['AWS_SES_FROM_EMAIL'] ?? 'no-reply@medora.health';

  return { host, port, secure, user, pass, from };
}

export class SmtpEmailService implements IEmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  }) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  static fromEnv(): SmtpEmailService | null {
    const config = readSmtpConfig();
    if (!config) return null;
    return new SmtpEmailService(config);
  }

  async sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildHospitalInvitationEmail({
      hospitalName: params.hospitalName,
      registrationUrl: params.registrationUrl,
      expiresInHours: 72,
      locale: params.locale,
    });

    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  }

  async sendPatientMagicLink(params: {
    to: string;
    magicLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildPatientMagicLinkEmail({
      magicLink: params.magicLink,
      locale: params.locale,
    });

    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  }

  async sendPatientOnboardingConfirmation(params: {
    to: string;
    dashboardLink: string;
    locale?: string | null;
    summary: {
      country?: string | null;
      department?: string | null;
      condition?: string | null;
      destination?: string | null;
      treatmentTimeline?: string | null;
    };
  }): Promise<void> {
    const content = buildPatientOnboardingEmail({
      dashboardLink: params.dashboardLink,
      locale: params.locale,
      summary: params.summary,
    });

    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  }

  async sendAdminNewCaseAlert(params: {
    to: string;
    patientName: string;
    patientEmail: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildAdminNewCaseEmail(params);
    await this.sendRaw(params.to, content.subject, content.text, content.html);
  }

  async sendAdminNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildAdminNewMessageEmail(params);
    await this.sendRaw(params.to, content.subject, content.text, content.html);
  }

  async sendAdminNewTicketAlert(params: {
    to: string;
    ticketNumber: string;
    patientName: string;
    subject: string;
    descriptionPreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildAdminNewTicketEmail(params);
    await this.sendRaw(params.to, content.subject, content.text, content.html);
  }

  async sendPatientNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void> {
    const replyTo = formatPatientReplyTo(params.replyTo);
    const content = buildPatientNewMessageEmail({
      ...params,
      replyEnabled: Boolean(replyTo),
    });
    await this.sendRaw(params.to, content.subject, content.text, content.html, {
      from: PATIENT_NOTIFICATION_FROM,
      replyTo,
    });
  }

  async sendPatientCaseUpdateAlert(params: {
    to: string;
    patientName: string;
    subject: string;
    messagePreview: string;
    bodyLines?: string[];
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void> {
    const replyTo = formatPatientReplyTo(params.replyTo);
    const content = buildPatientNewMessageEmail({
      ...params,
      preheader: 'Open your patient dashboard to review the latest update.',
      eyebrow: 'Case Update',
      title: params.subject,
      introLine: `${params.patientName}, there is a new update on your Medora case.`,
      body: params.bodyLines,
      primaryActionLabel: 'Review case update',
      speaker: 'Medora case update',
      replyEnabled: Boolean(replyTo),
    });
    await this.sendRaw(params.to, content.subject, content.text, content.html, {
      from: PATIENT_NOTIFICATION_FROM,
      replyTo,
    });
  }

  private async sendRaw(
    to: string,
    subject: string,
    text: string,
    html: string,
    options?: {
      from?: string;
      replyTo?: string;
    },
  ): Promise<void> {
    await this.transporter.sendMail({
      from: options?.from ?? this.from,
      to,
      subject,
      text,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    });
  }
}
