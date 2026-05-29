import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequestHospitalPasswordResetUseCase,
} from '../src/use-cases/hospitals/request-hospital-password-reset.use-case.js';
import {
  ResetHospitalPasswordUseCase,
} from '../src/use-cases/hospitals/reset-hospital-password.use-case.js';
import {
  ValidateHospitalPasswordResetTokenUseCase,
} from '../src/use-cases/hospitals/validate-hospital-password-reset-token.use-case.js';
import type {
  IEmailService,
  IHospitalManagementRepository,
  IHospitalPasswordResetTokenRepository,
  IKeycloakAdminService,
  IUserRepository,
} from '@medical-crm/domain';
import { Hospital, HospitalPasswordResetToken } from '@medical-crm/domain';

const makeHospital = () =>
  new Hospital({
    id: 'hospital-1',
    name: 'Shanghai Medora Hospital',
    nameEn: 'Shanghai Medora Hospital',
    address: null,
    city: 'Shanghai',
    phone: null,
    email: 'contact@hospital.test',
    description: null,
    logoUrl: null,
    specialties: null,
    status: 'ACTIVE',
    type: 'REGULAR',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const makeToken = (overrides: Partial<ConstructorParameters<typeof HospitalPasswordResetToken>[0]> = {}) =>
  new HospitalPasswordResetToken({
    id: 'token-id',
    userId: 'user-1',
    hospitalId: 'hospital-1',
    keycloakUserId: 'kc-user-1',
    tokenHash: HospitalPasswordResetToken.hashToken('reset-token'),
    email: 'doctor@hospital.test',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

describe('hospital password reset use cases', () => {
  let userRepo: IUserRepository;
  let hospitalRepo: IHospitalManagementRepository;
  let tokenRepo: IHospitalPasswordResetTokenRepository;
  let emailService: IEmailService;
  let keycloakAdmin: IKeycloakAdminService;
  const originalEnv = {
    HOSPITAL_ORIGIN: process.env.HOSPITAL_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOSPITAL_ORIGIN = 'https://hospital.medicaltourismchina.health';
    process.env.NODE_ENV = 'test';

    userRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'Doctor@Hospital.TEST',
        name: 'Doctor',
        role: 'HOSPITAL',
        phone: null,
        patientSite: null,
        preferredLanguage: 'zh',
        hospitalId: 'hospital-1',
        keycloakUserId: 'kc-user-1',
        notificationSettings: null,
      }),
      update: vi.fn(),
      listAdminEmails: vi.fn(),
      listHospitalEmails: vi.fn(),
    };

    hospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(makeHospital()),
      findMany: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };

    tokenRepo = {
      findByToken: vi.fn().mockResolvedValue(makeToken()),
      findByUserId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation(async (token) => token),
    };

    emailService = {
      sendHospitalInvitation: vi.fn(),
      sendHospitalPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPatientMagicLink: vi.fn(),
      sendPatientOnboardingConfirmation: vi.fn(),
      sendAdminNewCaseAlert: vi.fn(),
      sendAdminNewMessageAlert: vi.fn(),
      sendAdminNewTicketAlert: vi.fn(),
      sendPatientNewMessageAlert: vi.fn(),
      sendPatientCaseUpdateAlert: vi.fn(),
    };

    keycloakAdmin = {
      createUser: vi.fn(),
      setPassword: vi.fn().mockResolvedValue(undefined),
      assignRole: vi.fn(),
      deleteUser: vi.fn(),
      checkUsernameExists: vi.fn(),
      checkEmailExists: vi.fn(),
      updateUserEmail: vi.fn(),
      verifyPassword: vi.fn(),
    };
  });

  afterEach(() => {
    if (originalEnv.HOSPITAL_ORIGIN === undefined) delete process.env.HOSPITAL_ORIGIN;
    else process.env.HOSPITAL_ORIGIN = originalEnv.HOSPITAL_ORIGIN;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  it('creates a one-hour reset token and emails a hospital reset link', async () => {
    const useCase = new RequestHospitalPasswordResetUseCase(
      userRepo,
      hospitalRepo,
      tokenRepo,
      emailService,
    );

    const result = await useCase.execute({ email: ' Doctor@Hospital.TEST ' });

    expect(result).toEqual({ ok: true });
    expect(userRepo.findByEmail).toHaveBeenCalledWith('doctor@hospital.test');
    expect(tokenRepo.save).toHaveBeenCalledOnce();
    const savedToken = vi.mocked(tokenRepo.save).mock.calls[0]?.[0];
    expect(savedToken.email).toBe('doctor@hospital.test');
    expect(savedToken.userId).toBe('user-1');
    expect(savedToken.hospitalId).toBe('hospital-1');
    expect(savedToken.keycloakUserId).toBe('kc-user-1');
    expect(savedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(savedToken.expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    expect(emailService.sendHospitalPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      to: 'doctor@hospital.test',
      hospitalName: 'Shanghai Medora Hospital',
      resetUrl: expect.stringMatching(
        /^https:\/\/hospital\.medicaltourismchina\.health\/auth\/reset-password\?token=/,
      ),
      locale: 'zh',
    }));
  });

  it('does not reveal whether an account exists', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null);
    const useCase = new RequestHospitalPasswordResetUseCase(
      userRepo,
      hospitalRepo,
      tokenRepo,
      emailService,
    );

    await expect(useCase.execute({ email: 'missing@hospital.test' })).resolves.toEqual({ ok: true });
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(emailService.sendHospitalPasswordReset).not.toHaveBeenCalled();
  });

  it('does not issue reset links for non-hospital users', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue({
      id: 'patient-1',
      email: 'patient@test.com',
      name: 'Patient',
      role: 'PATIENT',
      phone: null,
      patientSite: 'china',
      preferredLanguage: 'zh',
      hospitalId: null,
      keycloakUserId: null,
      notificationSettings: null,
    });
    const useCase = new RequestHospitalPasswordResetUseCase(
      userRepo,
      hospitalRepo,
      tokenRepo,
      emailService,
    );

    await expect(useCase.execute({ email: 'patient@test.com' })).resolves.toEqual({ ok: true });
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(emailService.sendHospitalPasswordReset).not.toHaveBeenCalled();
  });

  it('suppresses duplicate emails while an active token is still inside cooldown', async () => {
    vi.mocked(tokenRepo.findByUserId).mockResolvedValue([
      makeToken({ createdAt: new Date() }),
    ]);
    const useCase = new RequestHospitalPasswordResetUseCase(
      userRepo,
      hospitalRepo,
      tokenRepo,
      emailService,
    );

    await expect(useCase.execute({ email: 'doctor@hospital.test' })).resolves.toEqual({ ok: true });
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(emailService.sendHospitalPasswordReset).not.toHaveBeenCalled();
  });

  it('validates active reset tokens', async () => {
    const useCase = new ValidateHospitalPasswordResetTokenUseCase(tokenRepo, hospitalRepo);

    const result = await useCase.execute('reset-token');

    expect(tokenRepo.findByToken).toHaveBeenCalledWith('reset-token');
    expect(result).toEqual({
      email: 'doctor@hospital.test',
      hospitalName: 'Shanghai Medora Hospital',
      expiresAt: expect.any(String),
    });
  });

  it('rejects used reset tokens', async () => {
    vi.mocked(tokenRepo.findByToken).mockResolvedValue(makeToken({
      usedAt: new Date(),
    }));
    const useCase = new ValidateHospitalPasswordResetTokenUseCase(tokenRepo, hospitalRepo);

    await expect(useCase.execute('reset-token')).rejects.toThrow('This password reset link has already been used');
  });

  it('sets the Keycloak password and marks the token used', async () => {
    const useCase = new ResetHospitalPasswordUseCase(tokenRepo, keycloakAdmin);

    await useCase.execute({ token: 'reset-token', password: 'wanghao1122' });

    expect(keycloakAdmin.setPassword).toHaveBeenCalledWith('kc-user-1', 'wanghao1122');
    expect(tokenRepo.save).toHaveBeenCalledOnce();
    const savedToken = vi.mocked(tokenRepo.save).mock.calls[0]?.[0];
    expect(savedToken.isUsed()).toBe(true);
  });

  it('invalidates other active reset tokens for the same user after a successful reset', async () => {
    const currentToken = makeToken({ id: 'current-token' });
    const siblingToken = makeToken({ id: 'sibling-token', tokenHash: HospitalPasswordResetToken.hashToken('sibling-token') });
    vi.mocked(tokenRepo.findByToken).mockResolvedValue(currentToken);
    vi.mocked(tokenRepo.findByUserId).mockResolvedValue([currentToken, siblingToken]);
    const useCase = new ResetHospitalPasswordUseCase(tokenRepo, keycloakAdmin);

    await useCase.execute({ token: 'reset-token', password: 'wanghao1122' });

    expect(tokenRepo.save).toHaveBeenCalledTimes(2);
    expect(currentToken.isUsed()).toBe(true);
    expect(siblingToken.isUsed()).toBe(true);
  });

  it('rejects expired reset tokens', async () => {
    vi.mocked(tokenRepo.findByToken).mockResolvedValue(makeToken({
      expiresAt: new Date(Date.now() - 1000),
    }));
    const useCase = new ResetHospitalPasswordUseCase(tokenRepo, keycloakAdmin);

    await expect(useCase.execute({ token: 'reset-token', password: 'wanghao1122' })).rejects.toThrow(
      'This password reset link has expired',
    );
    expect(keycloakAdmin.setPassword).not.toHaveBeenCalled();
  });
});
