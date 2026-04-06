import type { PatientAuthService, PatientEntryTokenPayload } from '@medical-crm/domain';

export class VerifyPatientEntryTokenAuthError extends Error {}

export class VerifyPatientEntryTokenUseCase {
  constructor(
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string }): Promise<PatientEntryTokenPayload> {
    try {
      return await this.authService.verifyPatientEntryToken(input.token);
    } catch {
      throw new VerifyPatientEntryTokenAuthError('Invalid token');
    }
  }
}
