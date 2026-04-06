import type { PatientAuthService, IUserEmailLookupRepository } from '@medical-crm/domain';
import { EmailRoleConflictError } from './patient-entry-auth.errors.js';
import type { IMagicLinkEmailService } from './send-magic-link.use-case.js';

export class SendPatientLoginLinkUseCase {
  constructor(
    private readonly userEmailLookupRepo: IUserEmailLookupRepository,
    private readonly authService: PatientAuthService,
    private readonly emailService: IMagicLinkEmailService,
  ) {}

  async execute(input: { email: string }): Promise<{ delivery: 'dashboard-login' | 'register'; token: string }> {
    const emailState = await this.userEmailLookupRepo.findEmailState(input.email);
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

    if (emailState.state === 'PATIENT') {
      const token = await this.authService.createPatientLoginToken(input.email);
      await this.emailService.sendMagicLink(input.email, `${frontendUrl}/dashboard?token=${token}`);
      return { delivery: 'dashboard-login', token };
    }

    if (emailState.state === 'NONE') {
      const token = await this.authService.createPatientRegisterToken(input.email);
      await this.emailService.sendMagicLink(input.email, `${frontendUrl}/free-quote?token=${token}`);
      return { delivery: 'register', token };
    }

    throw new EmailRoleConflictError();
  }
}
