import nodemailer, { type Transporter } from 'nodemailer';
import type { IEmailService } from '@medical-crm/domain';
import { buildHospitalInvitationEmail } from './hospital-invitation-email.template.js';
import { buildPatientMagicLinkEmail } from './patient-magic-link-email.template.js';

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
}
