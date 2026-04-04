import type { IUserEmailLookupRepository } from '@medical-crm/domain';
import { EmailRoleConflictError } from './patient-entry-auth.errors.js';

export class SendPatientLoginLinkUseCase {
  constructor(
    private readonly userEmailLookupRepo: IUserEmailLookupRepository,
  ) {}

  async execute(input: { email: string }): Promise<{ delivery: 'dashboard-login' | 'register' }> {
    const emailState = await this.userEmailLookupRepo.findEmailState(input.email);

    if (emailState.state === 'PATIENT') {
      return { delivery: 'dashboard-login' };
    }

    if (emailState.state === 'NONE') {
      return { delivery: 'register' };
    }

    throw new EmailRoleConflictError();
  }
}
