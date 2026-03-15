import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListHospitalsUseCase } from '../src/use-cases/hospitals/list-hospitals.use-case.js';
import type { IHospitalManagementRepository, HospitalListQuery } from '@medical-crm/domain';
import { Hospital } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('ListHospitalsUseCase', () => {
  let useCase: ListHospitalsUseCase;
  let mockHospitalRepo: IHospitalManagementRepository;

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

  const mockHospital = new Hospital({
    id: 'h-1',
    name: 'Test Hospital',
    nameEn: 'Test Hospital EN',
    address: '123 Main St',
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

  const mockPaginatedResult = {
    data: [mockHospital],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
  };

  beforeEach(() => {
    mockHospitalRepo = {
      findFullById: vi.fn(),
      findMany: vi.fn().mockResolvedValue(mockPaginatedResult),
      save: vi.fn(),
      updateStatus: vi.fn(),
    };
    useCase = new ListHospitalsUseCase(mockHospitalRepo);
  });

  it('returns PaginatedResult<HospitalDTO> for ADMIN actor', async () => {
    const query: HospitalListQuery = { page: 1, limit: 20 };
    const result = await useCase.execute(query, adminActor);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data[0]!.id).toBe('h-1');
    expect(result.data[0]!.name).toBe('Test Hospital');
    expect(typeof result.data[0]!.createdAt).toBe('string');
    expect(typeof result.data[0]!.updatedAt).toBe('string');
  });

  it('passes query directly to the repository', async () => {
    const query: HospitalListQuery = { page: 2, limit: 10, status: 'ACTIVE', type: 'BEAUTY', search: 'test' };
    await useCase.execute(query, adminActor);

    expect(mockHospitalRepo.findMany).toHaveBeenCalledWith(query);
  });

  it('maps hospital entities to DTOs', async () => {
    const query: HospitalListQuery = { page: 1, limit: 20 };
    const result = await useCase.execute(query, adminActor);

    const dto = result.data[0]!;
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(dto.status).toBe('ACTIVE');
    expect(dto.type).toBe('BEAUTY');
  });

  it('throws ForbiddenError for HOSPITAL role', async () => {
    const query: HospitalListQuery = { page: 1, limit: 20 };

    await expect(
      useCase.execute(query, hospitalActor),
    ).rejects.toThrow('Only admins can list hospitals');
  });

  it('preserves pagination metadata from the repository result', async () => {
    mockHospitalRepo.findMany = vi.fn().mockResolvedValue({
      data: [mockHospital, mockHospital],
      total: 50,
      page: 3,
      limit: 10,
      totalPages: 5,
      hasMore: true,
    });

    const query: HospitalListQuery = { page: 3, limit: 10 };
    const result = await useCase.execute(query, adminActor);

    expect(result.total).toBe(50);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(5);
    expect(result.hasMore).toBe(true);
  });
});
