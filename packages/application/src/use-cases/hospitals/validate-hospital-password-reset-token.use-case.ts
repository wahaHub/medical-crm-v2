import { NotFoundError, ValidationError } from '@medical-crm/utils';
import type {
  IHospitalManagementRepository,
  IHospitalPasswordResetTokenRepository,
} from '@medical-crm/domain';

export interface HospitalPasswordResetTokenValidationResult {
  email: string;
  hospitalName: string;
  expiresAt: string;
}

export class ValidateHospitalPasswordResetTokenUseCase {
  constructor(
    private readonly tokenRepo: IHospitalPasswordResetTokenRepository,
    private readonly hospitalRepo: IHospitalManagementRepository,
  ) {}

  async execute(token: string): Promise<HospitalPasswordResetTokenValidationResult> {
    const resetToken = await this.tokenRepo.findByToken(token);
    if (!resetToken) throw new NotFoundError('Invalid password reset link');
    if (resetToken.isUsed()) throw new ValidationError('This password reset link has already been used');
    if (resetToken.isExpired()) throw new ValidationError('This password reset link has expired');

    const hospital = resetToken.hospitalId
      ? await this.hospitalRepo.findFullById(resetToken.hospitalId)
      : null;

    return {
      email: resetToken.email,
      hospitalName: hospital?.name ?? 'Hospital account',
      expiresAt: resetToken.expiresAt.toISOString(),
    };
  }
}
