import type { IPatientRepository, PatientAuthService } from '@medical-crm/domain';

export class VerifyMagicLinkUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly authService: PatientAuthService,
  ) {}

  async execute(input: { token: string }): Promise<{ sessionToken: string; patientId: string }> {
    const payload = await this.authService.verifyMagicLinkToken(input.token);
    const patient = await this.patientRepo.findByEmail(payload.email);
    if (!patient) throw new Error('Patient not found');
    const sessionToken = await this.authService.createSessionToken(patient.id);
    return { sessionToken, patientId: patient.id };
  }
}
