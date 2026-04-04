import type { PatientAuthService, PatientEntryTokenPayload } from '@medical-crm/domain';

export class VerifyPatientEntryTokenUseCase {
  constructor(
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string }): Promise<PatientEntryTokenPayload> {
    return await this.authService.verifyPatientEntryToken(input.token);
  }
}
