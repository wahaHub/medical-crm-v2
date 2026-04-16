import type { PatientAuthService, PatientEntryTokenPayload, PatientSite } from '@medical-crm/domain';

export class VerifyPatientEntryTokenAuthError extends Error {}

export class VerifyPatientEntryTokenUseCase {
  constructor(
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string; site: PatientSite }): Promise<PatientEntryTokenPayload> {
    try {
      return await this.authService.verifyPatientEntryToken(input.token, input.site);
    } catch {
      throw new VerifyPatientEntryTokenAuthError('Invalid token');
    }
  }
}
