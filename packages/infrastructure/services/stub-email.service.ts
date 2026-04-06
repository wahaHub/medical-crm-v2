import type { IEmailService } from '@medical-crm/domain';

export class StubEmailService implements IEmailService {
  async sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Hospital invitation to ${params.to} for ${params.hospitalName} (${params.locale ?? 'default'}): ${params.registrationUrl}`);
  }

  async sendPatientMagicLink(params: {
    to: string;
    magicLink: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Patient magic link to ${params.to} (${params.locale ?? 'default'}): ${params.magicLink}`);
  }
}
