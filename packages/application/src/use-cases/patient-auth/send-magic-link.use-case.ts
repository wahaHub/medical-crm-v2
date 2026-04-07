import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';
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

  async execute(input: { email: string }): Promise<void> {
    const patient = await this.patientRepo.findByEmail(input.email);
    if (!patient) return; // Silent — no email leak
    const token = await this.authService.createMagicLinkToken(input.email);
    const link = `${getPatientAppOrigin()}/dashboard?token=${token}`;
    await this.emailService.sendMagicLink(input.email, link, patient.preferredLanguage);
  }
}
