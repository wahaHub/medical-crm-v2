import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export class VerifyMagicLinkAuthError extends Error {}

export class VerifyMagicLinkUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string }): Promise<{
    sessionToken: string;
    restoreToken: string;
    restoreCookie: string;
    patientId: string;
  }> {
    let payload;
    try {
      payload = await this.authService.verifyMagicLinkToken(input.token);
    } catch {
      throw new VerifyMagicLinkAuthError('Invalid token');
    }

    const patient = await this.patientRepo.findByEmail(payload.email);
    if (!patient) {
      throw new VerifyMagicLinkAuthError('Patient not found');
    }
    const sessionToken = await this.authService.createSessionToken(patient.id);
    const { restoreToken, restoreCookie } = await this.authService.createGuestRestoreArtifacts(patient.id);
    return { sessionToken, restoreToken, restoreCookie, patientId: patient.id };
  }
}
