import type { IPatientRepository, PatientAuthService, PatientSite } from '@medical-crm/domain';
import { getPatientAppOrigin } from './patient-app-origin.js';

export interface IMagicLinkEmailService {
  sendMagicLink(email: string, link: string, locale?: string | null): Promise<void>;
}

export class SendMagicLinkUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
    private readonly emailService: IMagicLinkEmailService,
  ) {}

  async execute(input: { email: string; site: PatientSite }): Promise<void> {
    const patient = await this.patientRepo.findByEmail(input.email, input.site);
    if (!patient) return; // Silent — no email leak
    const token = await this.authService.createMagicLinkToken(input.email, input.site);
    const link = `${getPatientAppOrigin(input.site)}/dashboard?token=${token}`;
    await this.emailService.sendMagicLink(input.email, link, patient.preferredLanguage);
  }
}
