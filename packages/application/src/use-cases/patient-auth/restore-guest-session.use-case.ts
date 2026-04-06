import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export class RestoreGuestSessionAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'RestoreGuestSessionAuthError';
  }
}

export class RestoreGuestSessionUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { restoreToken: string; restoreCookie: string }): Promise<{
    sessionToken: string;
    restoreToken: string;
    restoreCookie: string;
    patientId: string;
  }> {
    let payload: Awaited<ReturnType<PatientAuthService['verifyGuestRestoreCookie']>>;
    try {
      payload = await this.authService.verifyGuestRestoreCookie(input.restoreCookie, input.restoreToken);
    } catch (error) {
      throw new RestoreGuestSessionAuthError(error instanceof Error ? error.message : 'Unauthorized');
    }

    const patient = await this.patientRepo.findById(payload.userId);
    if (!patient) throw new Error('Patient not found');

    const sessionToken = await this.authService.createSessionToken(patient.id);
    const { restoreToken, restoreCookie } = await this.authService.createGuestRestoreArtifacts(patient.id);

    return {
      patientId: patient.id,
      sessionToken,
      restoreToken,
      restoreCookie,
    };
  }
}
