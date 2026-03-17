import type { IPatientRepository } from '@medical-crm/domain';

export class SetPasswordUseCase {
  constructor(private readonly patientRepo: IPatientRepository) {}

  async execute(input: { userId: string; password: string }): Promise<void> {
    // Dynamic import to avoid bundling issues — bcryptjs is only needed here
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(input.password, 12);
    await this.patientRepo.updatePasswordHash(input.userId, hash);
  }
}
