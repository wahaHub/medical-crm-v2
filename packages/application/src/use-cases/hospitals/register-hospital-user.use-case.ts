import { generateId, ValidationError, NotFoundError, ConflictError } from '@medical-crm/utils';
import type {
  IRegistrationTokenRepository,
  IKeycloakAdminService,
  IHospitalManagementRepository,
  IUserRepository,
} from '@medical-crm/domain';

export interface RegisterHospitalUserInput {
  token: string;
  username: string;
  password: string;
}

export class RegisterHospitalUserUseCase {
  constructor(
    private readonly tokenRepo: IRegistrationTokenRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
    private readonly hospitalRepo: IHospitalManagementRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(input: RegisterHospitalUserInput): Promise<{ userId: string; email: string }> {
    // 1. Validate token
    const token = await this.tokenRepo.findByToken(input.token);
    if (!token) throw new ValidationError('Invalid registration token');
    if (token.isUsed()) throw new ValidationError('Registration token has already been used');
    if (token.isExpired()) throw new ValidationError('Registration token has expired');

    // 2. Check uniqueness via KC Admin API
    const [usernameExists, emailExists] = await Promise.all([
      this.keycloakAdmin.checkUsernameExists(input.username),
      this.keycloakAdmin.checkEmailExists(token.email),
    ]);
    if (usernameExists) throw new ConflictError('Username already exists');
    if (emailExists) throw new ConflictError('Email already exists');

    // 3. Get hospital to determine role
    const hospital = await this.hospitalRepo.findFullById(token.hospitalId);
    if (!hospital) throw new NotFoundError('Hospital not found');
    const kcRole = hospital.type === 'REGULAR' ? 'regular_hospital' : 'hospital';

    // 4. Create KC user — everything after this is inside compensation try/catch
    const keycloakUserId = await this.keycloakAdmin.createUser(
      input.username,
      token.email,
      hospital.name,
      hospital.id,
    );

    try {
      // 5. Set password + assign role (inside try — if these fail, clean up KC user)
      await this.keycloakAdmin.setPassword(keycloakUserId, input.password);
      await this.keycloakAdmin.assignRole(keycloakUserId, kcRole);

      // 6. Create CRM user in DB via IUserRepository
      // NOTE: v1 uses hospital.name for the CRM user name field, NOT input.username.
      const crmUserId = generateId();
      await this.userRepo.create({
        id: crmUserId,
        email: token.email,
        name: hospital.name,
        role: 'HOSPITAL',
        hospitalId: token.hospitalId,
        preferredLanguage: 'zh',
        keycloakUserId,
      });

      // 7. Mark token as used
      token.markUsed(keycloakUserId);
      await this.tokenRepo.save(token);

      return { userId: crmUserId, email: token.email };
    } catch (err) {
      // COMPENSATION: Clean up KC user if setPassword, assignRole, or CRM user creation fails
      await this.keycloakAdmin.deleteUser(keycloakUserId);
      throw err;
    }
  }
}
