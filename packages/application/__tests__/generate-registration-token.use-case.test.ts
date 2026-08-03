import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateRegistrationTokenUseCase } from '../src/use-cases/hospitals/generate-registration-token.use-case.js';
import type {
  IEmailService,
  IHospitalManagementRepository,
  IKeycloakAdminService,
  IRegistrationTokenRepository,
  IUserRepository,
} from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GenerateRegistrationTokenUseCase', () => {
  let useCase: GenerateRegistrationTokenUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockTokenRepo: IRegistrationTokenRepository;
  let mockUserRepo: IUserRepository;
  let mockKeycloakAdmin: IKeycloakAdminService;
  let mockEmailService: IEmailService;
  const originalEnv = {
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  };

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-1',
  };

  const patientActor: Actor = {
    userId: 'patient-1',
    email: 'patient@test.com',
    role: 'PATIENT',
    hospitalId: null,
  };

  const mockHospital = new Hospital({
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
    type: 'BEAUTY',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(mockHospital),
      findMany: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockTokenRepo = {
      findByToken: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn().mockImplementation((token) => Promise.resolve(token)),
    };

    mockUserRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      listAdminEmails: vi.fn(),
      listHospitalEmails: vi.fn(),
    };

    mockKeycloakAdmin = {
      createUser: vi.fn(),
      setPassword: vi.fn(),
      assignRole: vi.fn(),
      deleteUser: vi.fn(),
      checkUsernameExists: vi.fn(),
      checkEmailExists: vi.fn().mockResolvedValue(false),
      updateUserEmail: vi.fn(),
      verifyPassword: vi.fn(),
    };

    mockEmailService = {
      sendHospitalInvitation: vi.fn().mockResolvedValue(undefined),
      sendPatientMagicLink: vi.fn(),
      sendPatientOnboardingConfirmation: vi.fn(),
      sendPatientRecordsUploadConfirmation: vi.fn(),
      sendAdminNewCaseAlert: vi.fn(),
      sendAdminNewMessageAlert: vi.fn(),
      sendAdminNewTicketAlert: vi.fn(),
      sendPatientNewMessageAlert: vi.fn(),
      sendPatientCaseUpdateAlert: vi.fn(),
    };

    if (originalEnv.ADMIN_ORIGIN === undefined) {
      delete process.env.ADMIN_ORIGIN;
    } else {
      process.env.ADMIN_ORIGIN = originalEnv.ADMIN_ORIGIN;
    }
    process.env.NODE_ENV = originalEnv.NODE_ENV;

    useCase = new GenerateRegistrationTokenUseCase(
      mockHospitalRepo,
      mockTokenRepo,
      null,
      mockUserRepo,
      mockKeycloakAdmin,
    );
  });

  it('allows a HOSPITAL actor to generate a token for its own hospital', async () => {
    const result = await useCase.execute('hosp-1', 'user@test.com', hospitalActor);

    expect(result).toHaveProperty('token');
    expect(mockTokenRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for a HOSPITAL actor generating a token for another hospital', async () => {
    await expect(
      useCase.execute('other-hospital', 'user@test.com', hospitalActor),
    ).rejects.toThrow('Only admins or the hospital itself can generate tokens');
  });

  it('throws ForbiddenError for PATIENT actor', async () => {
    await expect(
      useCase.execute('hosp-1', 'user@test.com', patientActor),
    ).rejects.toThrow('Only admins or the hospital itself can generate tokens');
  });

  it('throws NotFoundError when hospital does not exist', async () => {
    (mockHospitalRepo.findFullById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute('non-existent', 'user@test.com', adminActor),
    ).rejects.toThrow('Hospital not found');
  });

  it('generates token with 72-hour expiry', async () => {
    const before = new Date();
    const result = await useCase.execute('hosp-1', 'user@test.com', adminActor);
    const after = new Date();

    const expiresAt = new Date(result.expiresAt);
    const expectedMinExpiry = new Date(before.getTime() + 72 * 60 * 60 * 1000);
    const expectedMaxExpiry = new Date(after.getTime() + 72 * 60 * 60 * 1000);

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry.getTime());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry.getTime());
  });

  it('saves token to repository', async () => {
    await useCase.execute('hosp-1', 'user@test.com', adminActor);

    expect(mockTokenRepo.save).toHaveBeenCalledOnce();
  });

  it('returns token string and expiresAt ISO string', async () => {
    const result = await useCase.execute('hosp-1', 'user@test.com', adminActor);

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('expiresAt');
    expect(typeof result.token).toBe('string');
    expect(typeof result.expiresAt).toBe('string');
    // expiresAt should be a valid ISO string
    expect(() => new Date(result.expiresAt)).not.toThrow();
    expect(new Date(result.expiresAt).toISOString()).toBe(result.expiresAt);
  });

  it('calls findFullById with the given hospitalId', async () => {
    await useCase.execute('hosp-1', 'user@test.com', adminActor);

    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('hosp-1');
  });

  it('saves token with correct hospitalId and email', async () => {
    await useCase.execute('hosp-1', 'registration@test.com', adminActor);

    const savedToken = (mockTokenRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(savedToken.hospitalId).toBe('hosp-1');
    expect(savedToken.email).toBe('registration@test.com');
  });

  it('normalizes email before checking and saving the token', async () => {
    await useCase.execute('hosp-1', ' Registration@Test.COM ', adminActor);

    expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('registration@test.com');
    expect(mockKeycloakAdmin.checkEmailExists).toHaveBeenCalledWith('registration@test.com');
    const savedToken = (mockTokenRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(savedToken.email).toBe('registration@test.com');
  });

  it('rejects an email that is already registered as a patient', async () => {
    (mockUserRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'patient-1',
      email: 'patient@test.com',
      name: 'Patient',
      role: 'PATIENT',
      phone: null,
      patientSite: 'china',
      preferredLanguage: 'zh',
      hospitalId: null,
      notificationSettings: null,
    });

    await expect(
      useCase.execute('hosp-1', 'patient@test.com', hospitalActor),
    ).rejects.toThrow('This email is already registered as a patient.');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
    expect(mockKeycloakAdmin.checkEmailExists).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered as an admin', async () => {
    (mockUserRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'ADMIN',
      phone: null,
      patientSite: null,
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });

    await expect(
      useCase.execute('hosp-1', 'admin@test.com', hospitalActor),
    ).rejects.toThrow('This email is already registered as an admin.');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered for this hospital', async () => {
    (mockUserRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'hospital-user-1',
      email: 'owner@test.com',
      name: 'Hospital',
      role: 'HOSPITAL',
      phone: null,
      patientSite: null,
      preferredLanguage: 'zh',
      hospitalId: 'hosp-1',
      notificationSettings: null,
    });

    await expect(
      useCase.execute('hosp-1', 'owner@test.com', hospitalActor),
    ).rejects.toThrow('This email is already registered for this hospital.');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered for another hospital', async () => {
    (mockUserRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'hospital-user-2',
      email: 'other@test.com',
      name: 'Other Hospital',
      role: 'HOSPITAL',
      phone: null,
      patientSite: null,
      preferredLanguage: 'zh',
      hospitalId: 'other-hospital',
      notificationSettings: null,
    });

    await expect(
      useCase.execute('hosp-1', 'other@test.com', hospitalActor),
    ).rejects.toThrow('This email is already registered for another hospital.');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an email that already exists in Keycloak', async () => {
    (mockKeycloakAdmin.checkEmailExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      useCase.execute('hosp-1', 'keycloak@test.com', hospitalActor),
    ).rejects.toThrow('This email is already registered.');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
  });

  it('sends hospital invitation email with the configured admin origin', async () => {
    process.env.ADMIN_ORIGIN = 'https://admin.medicaltourismchina.health/';
    useCase = new GenerateRegistrationTokenUseCase(
      mockHospitalRepo,
      mockTokenRepo,
      mockEmailService,
      mockUserRepo,
      mockKeycloakAdmin,
    );

    const result = await useCase.execute('hosp-1', ' Invite@Test.COM ', adminActor);

    expect(mockEmailService.sendHospitalInvitation).toHaveBeenCalledWith({
      to: 'invite@test.com',
      hospitalName: 'Test Hospital',
      registrationUrl: `https://admin.medicaltourismchina.health/auth/hospital/register?token=${result.token}`,
    });
  });

  it('does not silently generate a localhost invitation URL in production when ADMIN_ORIGIN is missing', async () => {
    delete process.env.ADMIN_ORIGIN;
    process.env.NODE_ENV = 'production';
    useCase = new GenerateRegistrationTokenUseCase(
      mockHospitalRepo,
      mockTokenRepo,
      mockEmailService,
      mockUserRepo,
      mockKeycloakAdmin,
    );

    await expect(
      useCase.execute('hosp-1', 'invite@test.com', adminActor),
    ).rejects.toThrow('ADMIN_ORIGIN is required to generate hospital registration links');
    expect(mockTokenRepo.save).not.toHaveBeenCalled();
    expect(mockEmailService.sendHospitalInvitation).not.toHaveBeenCalled();
  });
});
