import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateRegistrationTokenUseCase } from '../src/use-cases/hospitals/generate-registration-token.use-case.js';
import type { IHospitalManagementRepository, IRegistrationTokenRepository } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GenerateRegistrationTokenUseCase', () => {
  let useCase: GenerateRegistrationTokenUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockTokenRepo: IRegistrationTokenRepository;

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
    hospitalId: 'h-1',
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

    useCase = new GenerateRegistrationTokenUseCase(mockHospitalRepo, mockTokenRepo);
  });

  it('throws ForbiddenError for HOSPITAL actor', async () => {
    await expect(
      useCase.execute('hosp-1', 'user@test.com', hospitalActor),
    ).rejects.toThrow('Only admins can generate tokens');
  });

  it('throws ForbiddenError for PATIENT actor', async () => {
    await expect(
      useCase.execute('hosp-1', 'user@test.com', patientActor),
    ).rejects.toThrow('Only admins can generate tokens');
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
});
