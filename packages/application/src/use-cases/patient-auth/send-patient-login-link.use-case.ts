import type { PatientAuthService, IUserEmailLookupRepository, PatientSite } from '@medical-crm/domain';
import { EmailRoleConflictError } from './patient-entry-auth.errors.js';
import type { IMagicLinkEmailService } from './send-magic-link.use-case.js';
import { getPatientAppOrigin } from './patient-app-origin.js';

export class SendPatientLoginLinkUseCase {
  constructor(
    private readonly userEmailLookupRepo: IUserEmailLookupRepository,
    private readonly authService: PatientAuthService,
    private readonly emailService: IMagicLinkEmailService,
  ) {}

  async execute(input: { email: string; site: PatientSite }): Promise<{ delivery: 'dashboard-login' | 'register'; token: string }> {
    const emailState = await this.userEmailLookupRepo.findEmailState(input.email, input.site);
    const frontendUrl = getPatientAppOrigin(input.site);

    if (emailState.state === 'PATIENT') {
      const token = await this.authService.createPatientLoginToken(input.email, input.site);
      await this.emailService.sendMagicLink(input.email, `${frontendUrl}/dashboard?token=${token}`);
      return { delivery: 'dashboard-login', token };
    }

    if (emailState.state === 'NONE') {
      const token = await this.authService.createPatientRegisterToken(input.email, input.site);
      await this.emailService.sendMagicLink(input.email, `${frontendUrl}/free-quote?token=${token}`);
      return { delivery: 'register', token };
    }

    throw new EmailRoleConflictError();
  }
}
