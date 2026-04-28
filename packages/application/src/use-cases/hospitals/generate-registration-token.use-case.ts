import { generateId, ConflictError, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { RegistrationToken } from '@medical-crm/domain';
import type {
  IHospitalManagementRepository,
  IKeycloakAdminService,
  IRegistrationTokenRepository,
  IEmailService,
  IUserRepository,
} from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';

export class GenerateRegistrationTokenUseCase {
  constructor(
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly emailService: IEmailService | null,
    private readonly userRepo: IUserRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
  ) {}

  async execute(hospitalId: string, email: string, actor: Actor): Promise<{ token: string; expiresAt: string }> {
    const canGenerate =
      actor.role === 'ADMIN'
      || (actor.role === 'HOSPITAL' && actor.hospitalId === hospitalId);
    if (!canGenerate) throw new ForbiddenError('Only admins or the hospital itself can generate tokens');

    const hospital = await this.hospitalRepo.findFullById(hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      if (existingUser.role === 'PATIENT') {
        throw new ConflictError('This email is already registered as a patient.');
      }
      if (existingUser.role === 'ADMIN') {
        throw new ConflictError('This email is already registered as an admin.');
      }
      if (existingUser.role === 'HOSPITAL' && existingUser.hospitalId === hospitalId) {
        throw new ConflictError('This email is already registered for this hospital.');
      }
      if (existingUser.role === 'HOSPITAL') {
        throw new ConflictError('This email is already registered for another hospital.');
      }
      throw new ConflictError('This email is already registered.');
    }

    const keycloakEmailExists = await this.keycloakAdmin.checkEmailExists(normalizedEmail);
    if (keycloakEmailExists) {
      throw new ConflictError('This email is already registered.');
    }

    const now = new Date();
    const token = new RegistrationToken({
      id: generateId(),
      hospitalId,
      token: crypto.randomUUID(),
      email: normalizedEmail,
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
          to: normalizedEmail,
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
