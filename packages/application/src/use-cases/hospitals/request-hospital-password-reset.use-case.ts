import { generateId } from '@medical-crm/utils';
import { HospitalPasswordResetToken } from '@medical-crm/domain';
import type {
  IEmailService,
  IHospitalManagementRepository,
  IHospitalPasswordResetTokenRepository,
  IUserRepository,
} from '@medical-crm/domain';

export interface RequestHospitalPasswordResetInput {
  email: string;
}

function resolveHospitalOrigin(): string {
  const origin = process.env.HOSPITAL_ORIGIN?.trim()
    ?? process.env.NEXT_PUBLIC_HOSPITAL_ORIGIN?.trim();
  if (origin) return origin.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('HOSPITAL_ORIGIN is required to generate hospital password reset links');
  }
  return 'http://localhost:3003';
}

export class RequestHospitalPasswordResetUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly tokenRepo: IHospitalPasswordResetTokenRepository,
    private readonly emailService: IEmailService | null,
  ) {}

  async execute(input: RequestHospitalPasswordResetInput): Promise<{ ok: true }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (
      !user
      || user.role !== 'HOSPITAL'
      || !user.keycloakUserId
    ) {
      return { ok: true };
    }

    const hospital = user.hospitalId
      ? await this.hospitalRepo.findFullById(user.hospitalId)
      : null;
    const hospitalName = hospital?.name ?? user.name;
    const now = new Date();
    const recentTokens = await this.tokenRepo.findByUserId(user.id);
    const cooldownStartedAt = new Date(now.getTime() - 10 * 60 * 1000);
    const recentActiveToken = recentTokens.some((existingToken) =>
      !existingToken.isUsed()
      && !existingToken.isExpired()
      && existingToken.createdAt > cooldownStartedAt,
    );
    if (recentActiveToken) {
      return { ok: true };
    }

    const rawToken = crypto.randomUUID();
    const token = new HospitalPasswordResetToken({
      id: generateId(),
      userId: user.id,
      hospitalId: user.hospitalId,
      keycloakUserId: user.keycloakUserId,
      tokenHash: HospitalPasswordResetToken.hashToken(rawToken),
      email: normalizedEmail,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      usedAt: null,
      createdAt: now,
    });

    await this.tokenRepo.save(token);

    if (this.emailService) {
      const resetUrl = `${resolveHospitalOrigin()}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
      try {
        await this.emailService.sendHospitalPasswordReset({
          to: normalizedEmail,
          hospitalName,
          resetUrl,
          locale: user.preferredLanguage,
        });
      } catch (error) {
        console.error('Failed to send hospital password reset email:', error);
      }
    }

    return { ok: true };
  }
}
