import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterHospitalUserUseCase } from '../src/use-cases/hospitals/register-hospital-user.use-case.js';
import type {
  IRegistrationTokenRepository,
  IKeycloakAdminService,
  IHospitalManagementRepository,
  IUserRepository,
} from '@medical-crm/domain';
import { RegistrationToken, Hospital } from '@medical-crm/domain';
import { ValidationError, ConflictError } from '@medical-crm/utils';

const makeToken = (overrides: Partial<ConstructorParameters<typeof RegistrationToken>[0]> = {}) =>
  new RegistrationToken({
    id: 'token-id-1',
    hospitalId: 'hosp-1',
    token: 'valid-token-abc',
    email: 'newuser@hospital.com',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    usedAt: null,
    keycloakUserId: null,
    createdAt: new Date(),
    ...overrides,
  });

const makeHospital = (type: 'BEAUTY' | 'REGULAR' | 'MEDICAL' = 'BEAUTY') =>
  new Hospital({
    id: 'hosp-1',
    name: 'Test Hospital',
    nameEn: 'Test Hospital EN',
    address: '123 Main St',
    city: null,
    phone: '+1234567890',
    email: 'contact@hospital.com',
    description: null,
    logoUrl: null,
    specialties: null,
    status: 'ACTIVE',
    type,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });

describe('RegisterHospitalUserUseCase', () => {
  let useCase: RegisterHospitalUserUseCase;
  let mockTokenRepo: IRegistrationTokenRepository;
  let mockKeycloakAdmin: IKeycloakAdminService;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockUserRepo: IUserRepository;

  const validInput = {
    token: 'valid-token-abc',
    username: 'newuser',
    password: 'SecurePass123!',
  };

  beforeEach(() => {
    mockTokenRepo = {
      findByToken: vi.fn().mockResolvedValue(makeToken()),
      findByHospitalId: vi.fn(),
      save: vi.fn().mockImplementation((t) => Promise.resolve(t)),
    };

    mockKeycloakAdmin = {
      createUser: vi.fn().mockResolvedValue('kc-user-id-xyz'),
      setPassword: vi.fn().mockResolvedValue(undefined),
      assignRole: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
      checkUsernameExists: vi.fn().mockResolvedValue(false),
      checkEmailExists: vi.fn().mockResolvedValue(false),
    };

    mockHospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(makeHospital()),
      findMany: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockUserRepo = {
      create: vi.fn().mockResolvedValue({ id: 'crm-user-id-1' }),
      findPreferredLanguage: vi.fn(),
    };

    useCase = new RegisterHospitalUserUseCase(
      mockTokenRepo,
      mockKeycloakAdmin,
      mockHospitalRepo,
      mockUserRepo,
    );
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('happy path: validates token, creates KC user, creates CRM user, marks token used', async () => {
    const result = await useCase.execute(validInput);

    // Token looked up
    expect(mockTokenRepo.findByToken).toHaveBeenCalledWith('valid-token-abc');

    // Uniqueness checks run in parallel
    expect(mockKeycloakAdmin.checkUsernameExists).toHaveBeenCalledWith('newuser');
    expect(mockKeycloakAdmin.checkEmailExists).toHaveBeenCalledWith('newuser@hospital.com');

    // Hospital fetched to determine role
    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('hosp-1');

    // KC user created with correct args
    expect(mockKeycloakAdmin.createUser).toHaveBeenCalledWith(
      'newuser',
      'newuser@hospital.com',
      'Test Hospital',
      'hosp-1',
    );

    // Password set + role assigned
    expect(mockKeycloakAdmin.setPassword).toHaveBeenCalledWith('kc-user-id-xyz', 'SecurePass123!');
    expect(mockKeycloakAdmin.assignRole).toHaveBeenCalledWith('kc-user-id-xyz', 'hospital');

    // CRM user created
    expect(mockUserRepo.create).toHaveBeenCalledOnce();
    const createArg = (mockUserRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      email: 'newuser@hospital.com',
      name: 'Test Hospital',
      role: 'HOSPITAL',
      hospitalId: 'hosp-1',
      preferredLanguage: 'zh',
    });
    expect(typeof createArg.id).toBe('string');

    // Token marked used + saved
    expect(mockTokenRepo.save).toHaveBeenCalledOnce();
    const savedToken = (mockTokenRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(savedToken.isUsed()).toBe(true);
    expect(savedToken.keycloakUserId).toBe('kc-user-id-xyz');

    // Returns correct shape
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('email', 'newuser@hospital.com');
    expect(typeof result.userId).toBe('string');
  });

  it('assigns role "regular_hospital" for REGULAR hospital type', async () => {
    (mockHospitalRepo.findFullById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHospital('REGULAR'),
    );

    await useCase.execute(validInput);

    expect(mockKeycloakAdmin.assignRole).toHaveBeenCalledWith('kc-user-id-xyz', 'regular_hospital');
  });

  it('assigns role "hospital" for BEAUTY hospital type', async () => {
    await useCase.execute(validInput);
    expect(mockKeycloakAdmin.assignRole).toHaveBeenCalledWith('kc-user-id-xyz', 'hospital');
  });

  it('assigns role "hospital" for MEDICAL hospital type', async () => {
    (mockHospitalRepo.findFullById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHospital('MEDICAL'),
    );

    await useCase.execute(validInput);

    expect(mockKeycloakAdmin.assignRole).toHaveBeenCalledWith('kc-user-id-xyz', 'hospital');
  });

  // -------------------------------------------------------------------------
  // Token validation failures
  // -------------------------------------------------------------------------

  it('throws ValidationError when token is not found', async () => {
    (mockTokenRepo.findByToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(useCase.execute(validInput)).rejects.toThrow(ValidationError);
    await expect(useCase.execute(validInput)).rejects.toThrow('Invalid registration token');
  });

  it('throws ValidationError when token is already used', async () => {
    const usedToken = makeToken({ usedAt: new Date(Date.now() - 1000), keycloakUserId: 'old-kc-id' });
    (mockTokenRepo.findByToken as ReturnType<typeof vi.fn>).mockResolvedValue(usedToken);

    await expect(useCase.execute(validInput)).rejects.toThrow(ValidationError);
    await expect(useCase.execute(validInput)).rejects.toThrow(
      'Registration token has already been used',
    );
  });

  it('throws ValidationError when token is expired', async () => {
    const expiredToken = makeToken({ expiresAt: new Date(Date.now() - 1000) });
    (mockTokenRepo.findByToken as ReturnType<typeof vi.fn>).mockResolvedValue(expiredToken);

    await expect(useCase.execute(validInput)).rejects.toThrow(ValidationError);
    await expect(useCase.execute(validInput)).rejects.toThrow('Registration token has expired');
  });

  // -------------------------------------------------------------------------
  // Uniqueness conflict failures
  // -------------------------------------------------------------------------

  it('throws ConflictError when username already exists in KC', async () => {
    (mockKeycloakAdmin.checkUsernameExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError);
    await expect(useCase.execute(validInput)).rejects.toThrow('Username already exists');
  });

  it('throws ConflictError when email already exists in KC', async () => {
    (mockKeycloakAdmin.checkEmailExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError);
    await expect(useCase.execute(validInput)).rejects.toThrow('Email already exists');
  });

  it('does NOT create KC user when uniqueness check fails', async () => {
    (mockKeycloakAdmin.checkUsernameExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError);
    expect(mockKeycloakAdmin.createUser).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // KC Compensation
  // -------------------------------------------------------------------------

  it('calls keycloakAdmin.deleteUser if CRM user creation fails (KC compensation)', async () => {
    const crmError = new Error('DB connection lost');
    (mockUserRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(crmError);

    await expect(useCase.execute(validInput)).rejects.toThrow('DB connection lost');

    // KC user must be cleaned up
    expect(mockKeycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-user-id-xyz');
  });

  it('calls keycloakAdmin.deleteUser if setPassword fails (KC compensation)', async () => {
    const pwError = new Error('setPassword failed');
    (mockKeycloakAdmin.setPassword as ReturnType<typeof vi.fn>).mockRejectedValue(pwError);

    await expect(useCase.execute(validInput)).rejects.toThrow('setPassword failed');

    expect(mockKeycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-user-id-xyz');
  });

  it('calls keycloakAdmin.deleteUser if assignRole fails (KC compensation)', async () => {
    const roleError = new Error('assignRole failed');
    (mockKeycloakAdmin.assignRole as ReturnType<typeof vi.fn>).mockRejectedValue(roleError);

    await expect(useCase.execute(validInput)).rejects.toThrow('assignRole failed');

    expect(mockKeycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-user-id-xyz');
  });

  it('re-throws original error after KC compensation', async () => {
    const originalError = new Error('Unexpected CRM failure');
    (mockUserRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);

    const thrown = await useCase.execute(validInput).catch((e: unknown) => e);
    expect(thrown).toBe(originalError);
  });

  it('does NOT call deleteUser in the happy path', async () => {
    await useCase.execute(validInput);
    expect(mockKeycloakAdmin.deleteUser).not.toHaveBeenCalled();
  });
});
