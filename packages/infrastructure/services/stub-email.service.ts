import type { IEmailService } from '@medical-crm/domain';

export class StubEmailService implements IEmailService {
  async sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Hospital invitation to ${params.to} for ${params.hospitalName}: ${params.registrationUrl}`);
  }
}
