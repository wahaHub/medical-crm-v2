import type { IEmailService } from '@medical-crm/domain';
import { buildHospitalInvitationEmail } from './hospital-invitation-email.template.js';
import { buildPatientMagicLinkEmail } from './patient-magic-link-email.template.js';
import { buildPatientOnboardingEmail } from './patient-onboarding-email.template.js';
import { buildAdminNewCaseEmail } from './admin-new-case-email.template.js';
import { buildAdminNewMessageEmail } from './admin-new-message-email.template.js';
import { buildAdminNewTicketEmail } from './admin-new-ticket-email.template.js';
import { buildPatientNewMessageEmail } from './patient-new-message-email.template.js';
import { fetchWithEmailTimeout } from './email-delivery.utils.js';

function getResendConfig() {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) return null;

  return {
    apiKey,
    from:
      process.env['RESEND_FROM_EMAIL'] ??
      process.env['EMAIL_FROM'] ??
      'Medora <onboarding@resend.dev>',
  };
}

export class ResendEmailService implements IEmailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: { apiKey: string; from: string }) {
    this.apiKey = config.apiKey;
    this.from = config.from;
  }

  static fromEnv(): ResendEmailService | null {
    const config = getResendConfig();
    if (!config) return null;
    return new ResendEmailService(config);
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

    const response = await fetchWithEmailTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Resend API failed: ${response.status}${details ? ` ${details}` : ''}`);
    }
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

    const response = await fetchWithEmailTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Resend API failed: ${response.status}${details ? ` ${details}` : ''}`);
    }
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

    const response = await fetchWithEmailTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Resend API failed: ${response.status}${details ? ` ${details}` : ''}`);
    }
  }

  async sendAdminNewCaseAlert(params: {
    to: string;
    patientName: string;
    patientEmail: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildAdminNewCaseEmail(params);
    await this.sendRaw(params.to, content.subject, content.html, content.text);
  }

  async sendAdminNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildAdminNewMessageEmail(params);
    await this.sendRaw(params.to, content.subject, content.html, content.text);
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
    await this.sendRaw(params.to, content.subject, content.html, content.text);
  }

  async sendPatientNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    dashboardLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildPatientNewMessageEmail(params);
    await this.sendRaw(params.to, content.subject, content.html, content.text);
  }

  async sendPatientCaseUpdateAlert(params: {
    to: string;
    patientName: string;
    subject: string;
    messagePreview: string;
    bodyLines?: string[];
    dashboardLink: string;
    locale?: string | null;
  }): Promise<void> {
    const content = buildPatientNewMessageEmail({
      ...params,
      preheader: 'Open your patient dashboard to review the latest update.',
      eyebrow: 'Case Update',
      title: params.subject,
      introLine: `${params.patientName}, there is a new update on your Medora case.`,
      body: params.bodyLines,
      primaryActionLabel: 'Review case update',
      speaker: 'Medora case update',
    });
    await this.sendRaw(params.to, content.subject, content.html, content.text);
  }

  private async sendRaw(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetchWithEmailTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Resend API failed: ${response.status}${details ? ` ${details}` : ''}`);
    }
  }
}
