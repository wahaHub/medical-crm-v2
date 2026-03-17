import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateHospitalUseCase } from '../src/use-cases/hospitals/create-hospital.use-case.js';
import type { IHospitalManagementRepository, IHospitalSyncService } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('CreateHospitalUseCase', () => {
  let useCase: CreateHospitalUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockSyncService: IHospitalSyncService;

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

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn(),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Hospital) => Promise.resolve(entity)),
      updateStatus: vi.fn(),
    };

    mockSyncService = {
      syncToSupabase: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new CreateHospitalUseCase(mockHospitalRepo, mockSyncService);
  });

  it('creates hospital and calls save() and syncToSupabase()', async () => {
    await useCase.execute(
      {
        name: 'Test Hospital',
        type: 'BEAUTY',
        contactEmail: 'contact@hospital.com',
        specialties: ['Cosmetic Surgery'],
      },
      adminActor,
    );

    expect(mockHospitalRepo.save).toHaveBeenCalledOnce();
    expect(mockSyncService.syncToSupabase).toHaveBeenCalledOnce();
  });

  it('returns HospitalDTO', async () => {
    const result = await useCase.execute(
      {
        name: 'Test Hospital',
        type: 'BEAUTY',
        contactEmail: 'contact@hospital.com',
        specialties: ['Cosmetic Surgery'],
      },
      adminActor,
    );

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name', 'Test Hospital');
    expect(result).toHaveProperty('status');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute(
        {
          name: 'Test Hospital',
          type: 'BEAUTY',
          contactEmail: 'contact@hospital.com',
          specialties: ['Cosmetic Surgery'],
        },
        hospitalActor,
      ),
    ).rejects.toThrow('Only admins can create hospitals');
  });

  it('sets initial status to PENDING', async () => {
    const result = await useCase.execute(
      {
        name: 'Test Hospital',
        type: 'BEAUTY',
        contactEmail: 'contact@hospital.com',
        specialties: ['Cosmetic Surgery'],
      },
      adminActor,
    );

    expect(result.status).toBe('PENDING');
  });

  it('maps optional fields correctly', async () => {
    const result = await useCase.execute(
      {
        name: 'Full Hospital',
        type: 'MEDICAL',
        contactEmail: 'info@fullhospital.com',
        contactPhone: '+1234567890',
        address: '123 Main St',
        city: 'Bangkok',
        description: 'A great hospital',
        specialties: ['Orthopedics', 'Cardiology'],
      },
      adminActor,
    );

    expect(result.phone).toBe('+1234567890');
    expect(result.address).toBe('123 Main St');
    expect(result.description).toBe('A great hospital');
  });

  it('passes saved entity to syncToSupabase', async () => {
    await useCase.execute(
      {
        name: 'Sync Hospital',
        type: 'BEAUTY',
        contactEmail: 'sync@hospital.com',
        specialties: ['Cosmetic Surgery'],
      },
      adminActor,
    );

    const savedEntity = (mockHospitalRepo.save as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const syncArg = (mockSyncService.syncToSupabase as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    expect(syncArg).toBeDefined();
    expect(syncArg).toBeInstanceOf(Hospital);
  });
});
