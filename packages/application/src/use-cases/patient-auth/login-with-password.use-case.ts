import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export class LoginWithPasswordUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<{
    sessionToken: string;
    restoreToken: string;
    restoreCookie: string;
    patientId: string;
  }> {
    const patient = await this.patientRepo.findAuthByEmail(input.email);

    if (!patient?.passwordHash) {
      throw new Error('Invalid credentials');
    }

    const bcrypt = await import('bcryptjs');
    const passwordMatches = await bcrypt.compare(input.password, patient.passwordHash);

    if (!passwordMatches) {
      throw new Error('Invalid credentials');
    }

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
