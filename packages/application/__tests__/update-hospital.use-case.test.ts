import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateHospitalUseCase } from '../src/use-cases/hospitals/update-hospital.use-case.js';
import { UpdateHospitalStatusUseCase } from '../src/use-cases/hospitals/update-hospital-status.use-case.js';
import type { IHospitalManagementRepository, IHospitalSyncService } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

function makeHospital(overrides: Partial<ConstructorParameters<typeof Hospital>[0]> = {}) {
  return new Hospital({
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
    ...overrides,
  });
}

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

describe('UpdateHospitalUseCase', () => {
  let useCase: UpdateHospitalUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockSyncService: IHospitalSyncService;
  let mockEntity: Hospital;

  beforeEach(() => {
    mockEntity = makeHospital();

    mockHospitalRepo = {
      findFullById: vi.fn().mockResolvedValue(mockEntity),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Hospital) => Promise.resolve(entity)),
      updateStatus: vi.fn(),
    };

    mockSyncService = {
      syncToSupabase: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new UpdateHospitalUseCase(mockHospitalRepo, mockSyncService);
  });

  it('updates provided fields, calls save() and syncToSupabase()', async () => {
    const result = await useCase.execute(
      {
        id: 'h-1',
        name: 'Updated Hospital',
        description: 'New description',
      },
      adminActor,
    );

    expect(mockHospitalRepo.save).toHaveBeenCalledOnce();
    expect(mockSyncService.syncToSupabase).toHaveBeenCalledOnce();
    expect(result.name).toBe('Updated Hospital');
    expect(result.description).toBe('New description');
  });

  it('only updates provided fields, leaves others unchanged', async () => {
    const result = await useCase.execute(
      { id: 'h-1', name: 'New Name' },
      adminActor,
    );

    expect(result.name).toBe('New Name');
    // address was not in input, should retain original
    expect(result.address).toBe('123 Main St');
    expect(result.phone).toBe('+1234567890');
  });

  it('sets updatedAt to a new date', async () => {
    const before = new Date('2026-01-02T00:00:00Z');

    await useCase.execute({ id: 'h-1', name: 'New Name' }, adminActor);

    const savedEntity = (mockHospitalRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Hospital;
    expect(savedEntity.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('passes saved entity to syncToSupabase', async () => {
    await useCase.execute({ id: 'h-1', name: 'Sync Test' }, adminActor);

    const syncArg = (mockSyncService.syncToSupabase as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(syncArg).toBeInstanceOf(Hospital);
  });

  it('returns HospitalDTO with all required fields', async () => {
    const result = await useCase.execute({ id: 'h-1' }, adminActor);

    expect(result).toHaveProperty('id', 'h-1');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('status');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('throws NotFoundError if hospital not found', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'nonexistent' }, adminActor),
    ).rejects.toThrow('Hospital nonexistent not found');
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute({ id: 'h-1' }, hospitalActor),
    ).rejects.toThrow('Only admins can update hospitals');
  });

  it('calls findFullById with the provided id', async () => {
    await useCase.execute({ id: 'h-1' }, adminActor);

    expect(mockHospitalRepo.findFullById).toHaveBeenCalledWith('h-1');
  });
});

describe('UpdateHospitalStatusUseCase', () => {
  let useCase: UpdateHospitalStatusUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;
  let mockSyncService: IHospitalSyncService;

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn(),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Hospital) => Promise.resolve(entity)),
      updateStatus: vi.fn().mockImplementation((id: string, status: string) =>
        Promise.resolve(makeHospital({ status: status as 'ACTIVE' | 'INACTIVE' | 'PENDING' })),
      ),
    };

    mockSyncService = {
      syncToSupabase: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new UpdateHospitalStatusUseCase(mockHospitalRepo, mockSyncService);
  });

  it('calls activate() and updateStatus() for ACTIVE target', async () => {
    const pendingHospital = makeHospital({ status: 'PENDING' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(pendingHospital);

    const activateSpy = vi.spyOn(pendingHospital, 'activate');

    const result = await useCase.execute({ id: 'h-1', status: 'ACTIVE' }, adminActor);

    expect(activateSpy).toHaveBeenCalledOnce();
    expect(mockHospitalRepo.updateStatus).toHaveBeenCalledWith('h-1', 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('calls deactivate() and updateStatus() for INACTIVE target', async () => {
    const activeHospital = makeHospital({ status: 'ACTIVE' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(activeHospital);

    const deactivateSpy = vi.spyOn(activeHospital, 'deactivate');

    const result = await useCase.execute({ id: 'h-1', status: 'INACTIVE' }, adminActor);

    expect(deactivateSpy).toHaveBeenCalledOnce();
    expect(mockHospitalRepo.updateStatus).toHaveBeenCalledWith('h-1', 'INACTIVE');
    expect(result.status).toBe('INACTIVE');
  });

  it('throws ValidationError for invalid transitions (ACTIVE -> ACTIVE)', async () => {
    const activeHospital = makeHospital({ status: 'ACTIVE' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(activeHospital);

    await expect(
      useCase.execute({ id: 'h-1', status: 'ACTIVE' }, adminActor),
    ).rejects.toThrow('Cannot activate hospital from status ACTIVE');
  });

  it('throws ValidationError for invalid transition (PENDING -> INACTIVE)', async () => {
    const pendingHospital = makeHospital({ status: 'PENDING' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(pendingHospital);

    await expect(
      useCase.execute({ id: 'h-1', status: 'INACTIVE' }, adminActor),
    ).rejects.toThrow('Cannot deactivate hospital from status PENDING');
  });

  it('throws NotFoundError if hospital not found', async () => {
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'nonexistent', status: 'ACTIVE' }, adminActor),
    ).rejects.toThrow('Hospital nonexistent not found');
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute({ id: 'h-1', status: 'ACTIVE' }, hospitalActor),
    ).rejects.toThrow('Only admins can update hospital status');
  });

  it('returns HospitalDTO with updated status', async () => {
    const pendingHospital = makeHospital({ status: 'PENDING' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(pendingHospital);

    const result = await useCase.execute({ id: 'h-1', status: 'ACTIVE' }, adminActor);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('status');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('syncs the saved hospital to Supabase after status changes', async () => {
    const pendingHospital = makeHospital({ status: 'PENDING' });
    const savedHospital = makeHospital({ status: 'ACTIVE' });
    mockHospitalRepo.findFullById = vi.fn().mockResolvedValue(pendingHospital);
    mockHospitalRepo.updateStatus = vi.fn().mockResolvedValue(savedHospital);

    await useCase.execute({ id: 'h-1', status: 'ACTIVE' }, adminActor);

    expect(mockSyncService.syncToSupabase).toHaveBeenCalledOnce();
    expect(mockSyncService.syncToSupabase).toHaveBeenCalledWith(savedHospital);
  });
});
