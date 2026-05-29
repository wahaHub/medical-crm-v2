import { NotFoundError, ValidationError } from '@medical-crm/utils';
import type {
  IHospitalPasswordResetTokenRepository,
  IKeycloakAdminService,
} from '@medical-crm/domain';

export interface ResetHospitalPasswordInput {
  token: string;
  password: string;
}

export class ResetHospitalPasswordUseCase {
  constructor(
    private readonly tokenRepo: IHospitalPasswordResetTokenRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
  ) {}

  async execute(input: ResetHospitalPasswordInput): Promise<void> {
    const resetToken = await this.tokenRepo.findByToken(input.token);
    if (!resetToken) throw new NotFoundError('Invalid password reset link');
    if (resetToken.isUsed()) throw new ValidationError('This password reset link has already been used');
    if (resetToken.isExpired()) throw new ValidationError('This password reset link has expired');

    await this.keycloakAdmin.setPassword(resetToken.keycloakUserId, input.password);
    const userTokens = await this.tokenRepo.findByUserId(resetToken.userId);
    let currentTokenWasSaved = false;
    for (const token of userTokens) {
      if (token.id === resetToken.id) {
        currentTokenWasSaved = true;
      }
      if (!token.isUsed()) {
        token.markUsed();
        await this.tokenRepo.save(token);
      }
    }

    if (!currentTokenWasSaved) {
      resetToken.markUsed();
      await this.tokenRepo.save(resetToken);
    }
  }
}
