import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { RegistrationToken } from '@medical-crm/domain';
import type { IHospitalManagementRepository, IRegistrationTokenRepository, IEmailService } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';

export class GenerateRegistrationTokenUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly emailService: IEmailService | null,
  ) {}

  async execute(hospitalId: string, email: string, actor: Actor): Promise<{ token: string; expiresAt: string }> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can generate tokens');

    const hospital = await this.hospitalRepo.findFullById(hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');

    const now = new Date();
    const token = new RegistrationToken({
      id: generateId(),
      hospitalId,
      token: crypto.randomUUID(),
      email,
      expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      usedAt: null,
      keycloakUserId: null,
      createdAt: now,
    });

    await this.tokenRepo.save(token);

    if (this.emailService) {
      try {
        const registrationUrl = `${process.env.ADMIN_ORIGIN ?? 'http://localhost:3002'}/auth/hospital/register?token=${token.token}`;
        await this.emailService.sendHospitalInvitation({
          to: email,
          hospitalName: hospital.name,
          registrationUrl,
        });
      } catch (error) {
        console.error('Failed to send hospital invitation email:', error);
      }
    }

    return { token: token.token, expiresAt: token.expiresAt.toISOString() };
  }
}
