import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetHospitalUseCase } from '../src/use-cases/hospitals/get-hospital.use-case.js';
import type { IHospitalManagementRepository, IUserRepository } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetHospitalUseCase', () => {
  let useCase: GetHospitalUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockUserRepo: IUserRepository;

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

  const otherHospitalActor: Actor = {
    userId: 'hospital-2',
    email: 'other@test.com',
    role: 'HOSPITAL',
    hospitalId: 'h-2',
  };

  const mockHospital = new Hospital({
    id: 'h-1',
    name: 'Test Hospital',
    nameEn: 'Test Hospital EN',
    address: '123 Main St',
    city: null,
    phone: '+1234567890',
    email: 'info@test.com',
    description: 'A test hospital',
    logoUrl: null,
    specialties: ['Cardiology'],
    status: 'ACTIVE',
    type: 'BEAUTY',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  });

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(mockHospital),
      findMany: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };
    mockUserRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn().mockResolvedValue('zh'),
      findById: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetHospitalUseCase(mockHospitalRepo, mockUserRepo);
  });

  it('returns HospitalDTO for ADMIN actor viewing any hospital', async () => {
    const result = await useCase.execute('h-1', adminActor);

    expect(result.id).toBe('h-1');
    expect(result.name).toBe('Test Hospital');
    expect(result.status).toBe('ACTIVE');
    expect(result.type).toBe('BEAUTY');
    expect(result.hasRegisteredUser).toBe(true);
    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('h-1');
  });

  it('returns HospitalDTO when HOSPITAL actor views own hospital', async () => {
    const result = await useCase.execute('h-1', hospitalActor);

    expect(result.id).toBe('h-1');
    expect(result.name).toBe('Test Hospital');
  });

  it('maps dates to ISO strings in the DTO', async () => {
    const result = await useCase.execute('h-1', adminActor);

    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('sets hasRegisteredUser to false when no hospital user exists yet', async () => {
    (mockUserRepo.findPreferredLanguage as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute('h-1', adminActor);

    expect(result.hasRegisteredUser).toBe(false);
    expect(mockUserRepo.findPreferredLanguage).toHaveBeenCalledWith('h-1');
  });

  it('throws NotFoundError if hospital not found', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', adminActor),
    ).rejects.toThrow('Hospital nonexistent not found');
  });

  it('throws ForbiddenError if HOSPITAL actor tries to view a different hospital', async () => {
    await expect(
      useCase.execute('h-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this hospital');
  });

  it('throws NotFoundError before ForbiddenError check when hospital does not exist for HOSPITAL actor', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', hospitalActor),
    ).rejects.toThrow('Hospital nonexistent not found');
  });

  it('calls findFullById with the provided id', async () => {
    await useCase.execute('h-1', adminActor);

    expect(mockHospitalRepo.findFullById).toHaveBeenCalledOnce();
    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('h-1');
  });
});
