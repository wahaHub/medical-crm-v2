import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export interface IMagicLinkEmailService {
  sendMagicLink(email: string, link: string): Promise<void>;
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
    const link = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/dashboard?token=${token}`;
    await this.emailService.sendMagicLink(input.email, link);
  }
}
