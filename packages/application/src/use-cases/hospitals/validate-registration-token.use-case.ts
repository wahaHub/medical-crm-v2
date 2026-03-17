import { NotFoundError, ValidationError } from '@medical-crm/utils';
import type { IRegistrationTokenRepository, IHospitalManagementRepository } from '@medical-crm/domain';

export interface TokenValidationResult {
  hospitalName: string;
  hospitalNameEn: string | null;
  email: string;
  expiresAt: string;
}

export class ValidateRegistrationTokenUseCase {
  constructor(
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly hospitalRepo: IHospitalManagementRepository,
  ) {}

  async execute(token: string): Promise<TokenValidationResult> {
    const regToken = await this.tokenRepo.findByToken(token);
    if (!regToken) throw new NotFoundError('Invalid registration link');
    if (regToken.usedAt) throw new ValidationError('This registration link has already been used');
    if (regToken.expiresAt < new Date()) throw new ValidationError('This registration link has expired');

    const hospital = await this.hospitalRepo.findFullById(regToken.hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');

    return {
      hospitalName: hospital.name,
      hospitalNameEn: hospital.nameEn || null,
      email: regToken.email,
      expiresAt: regToken.expiresAt.toISOString(),
    };
  }
}
