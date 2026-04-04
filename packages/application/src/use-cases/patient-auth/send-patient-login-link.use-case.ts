import type { PatientAuthService, IUserEmailLookupRepository } from '@medical-crm/domain';
import { EmailRoleConflictError } from './patient-entry-auth.errors.js';

export class SendPatientLoginLinkUseCase {
  constructor(
    private readonly userEmailLookupRepo: IUserEmailLookupRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { email: string }): Promise<{ delivery: 'dashboard-login' | 'register'; token: string }> {
    const emailState = await this.userEmailLookupRepo.findEmailState(input.email);

    if (emailState.state === 'PATIENT') {
      const token = await this.authService.createPatientLoginToken(input.email);
      return { delivery: 'dashboard-login', token };
    }

    if (emailState.state === 'NONE') {
      const token = await this.authService.createPatientRegisterToken(input.email);
      return { delivery: 'register', token };
    }

    throw new EmailRoleConflictError();
  }
}
