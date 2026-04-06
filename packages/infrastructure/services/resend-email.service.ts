import type { IEmailService } from '@medical-crm/domain';
import { buildHospitalInvitationEmail } from './hospital-invitation-email.template.js';
import { buildPatientMagicLinkEmail } from './patient-magic-link-email.template.js';
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
}
