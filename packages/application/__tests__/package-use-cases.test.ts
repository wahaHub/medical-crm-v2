import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePackageUseCase } from '../src/use-cases/packages/create-package.use-case.js';
import { UpdatePackageUseCase } from '../src/use-cases/packages/update-package.use-case.js';
import { PublishPackageUseCase } from '../src/use-cases/packages/publish-package.use-case.js';
import { UnpublishPackageUseCase } from '../src/use-cases/packages/unpublish-package.use-case.js';
import { ListPackagesUseCase } from '../src/use-cases/packages/list-packages.use-case.js';
import { GetPackageUseCase } from '../src/use-cases/packages/get-package.use-case.js';
import type { IPackageRepository } from '@medical-crm/domain';
import { Package } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

// ——— Factories ———
function makeMockPackage(overrides: Partial<ConstructorParameters<typeof Package>[0]> = {}): Package {
  return new Package({
    id: 'pkg-1',
    nameEn: 'Test Package',
    nameZh: null,
    type: 'HEALTH_CHECKUP',
    price: '1000.00',
    currency: 'USD',
    descriptionEn: 'Test description',
    descriptionZh: null,
    inclusions: null,
    coverImageUrl: null,
    sortWeight: 0,
    status: 'DRAFT',
    publishAt: null,
    takedownAt: null,
    config: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function createMockPackageRepo(): IPackageRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  };
}

function createMockAiSyncTaskService() {
  return {
    enqueuePackageUpsert: vi.fn().mockResolvedValue(undefined),
    enqueuePackageDelete: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// CreatePackageUseCase
// ============================================================================
describe('CreatePackageUseCase', () => {
  let repo: IPackageRepository;

  beforeEach(() => {
    repo = createMockPackageRepo();
  });

  it('creates a package successfully as admin', async () => {
    const uc = new CreatePackageUseCase(repo);
    const result = await uc.execute({
      nameEn: 'New Package',
      type: 'HEALTH_CHECKUP',
      price: '500.00',
    }, adminActor);

    expect(result.nameEn).toBe('New Package');
    expect(result.type).toBe('HEALTH_CHECKUP');
    expect(result.price).toBe('500.00');
    expect(result.status).toBe('DRAFT');
    expect(result.createdBy).toBe('admin-1');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for non-admin', async () => {
    const uc = new CreatePackageUseCase(repo);
    await expect(uc.execute({
      nameEn: 'Test',
      type: 'HEALTH_CHECKUP',
      price: '100.00',
    }, patientActor)).rejects.toThrow('Admin only');
  });
});

// ============================================================================
// UpdatePackageUseCase
// ============================================================================
describe('UpdatePackageUseCase', () => {
  let repo: IPackageRepository;

  beforeEach(() => {
    repo = createMockPackageRepo();
  });

  it('updates a DRAFT package', async () => {
    const pkg = makeMockPackage({ status: 'DRAFT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new UpdatePackageUseCase(repo);
    const result = await uc.execute('pkg-1', { nameEn: 'Updated Name' }, adminActor);

    expect(result.nameEn).toBe('Updated Name');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('throws when updating a PUBLISHED package', async () => {
    const pkg = makeMockPackage({ status: 'PUBLISHED' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new UpdatePackageUseCase(repo);
    await expect(uc.execute('pkg-1', { nameEn: 'Nope' }, adminActor)).rejects.toThrow(
      'Can only update DRAFT packages',
    );
  });

  it('throws ForbiddenError for non-admin', async () => {
    const uc = new UpdatePackageUseCase(repo);
    await expect(uc.execute('pkg-1', { nameEn: 'Nope' }, patientActor)).rejects.toThrow('Admin only');
  });

  it('throws NotFoundError for missing package', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new UpdatePackageUseCase(repo);
    await expect(uc.execute('nope', { nameEn: 'X' }, adminActor)).rejects.toThrow('not found');
  });
});

// ============================================================================
// PublishPackageUseCase
// ============================================================================
describe('PublishPackageUseCase', () => {
  let repo: IPackageRepository;
  let aiSyncTaskService: ReturnType<typeof createMockAiSyncTaskService>;

  beforeEach(() => {
    repo = createMockPackageRepo();
    aiSyncTaskService = createMockAiSyncTaskService();
  });

  it('publishes a DRAFT package', async () => {
    const pkg = makeMockPackage({ status: 'DRAFT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new PublishPackageUseCase(repo, aiSyncTaskService as any);
    const result = await uc.execute('pkg-1', adminActor);

    expect(result.status).toBe('PUBLISHED');
    expect(repo.save).toHaveBeenCalledOnce();
    expect(aiSyncTaskService.enqueuePackageUpsert).toHaveBeenCalledOnce();
  });

  it('throws on publishing already PUBLISHED', async () => {
    const pkg = makeMockPackage({ status: 'PUBLISHED' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new PublishPackageUseCase(repo, aiSyncTaskService as any);
    await expect(uc.execute('pkg-1', adminActor)).rejects.toThrow('Cannot transition');
  });

  it('throws ForbiddenError for non-admin', async () => {
    const uc = new PublishPackageUseCase(repo, aiSyncTaskService as any);
    await expect(uc.execute('pkg-1', patientActor)).rejects.toThrow('Admin only');
  });
});

// ============================================================================
// UnpublishPackageUseCase
// ============================================================================
describe('UnpublishPackageUseCase', () => {
  let repo: IPackageRepository;
  let aiSyncTaskService: ReturnType<typeof createMockAiSyncTaskService>;

  beforeEach(() => {
    repo = createMockPackageRepo();
    aiSyncTaskService = createMockAiSyncTaskService();
  });

  it('unpublishes a PUBLISHED package', async () => {
    const pkg = makeMockPackage({ status: 'PUBLISHED' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new UnpublishPackageUseCase(repo, aiSyncTaskService as any);
    const result = await uc.execute('pkg-1', adminActor);

    expect(result.status).toBe('DRAFT');
    expect(repo.save).toHaveBeenCalledOnce();
    expect(aiSyncTaskService.enqueuePackageDelete).toHaveBeenCalledOnce();
  });

  it('throws on unpublishing DRAFT', async () => {
    const pkg = makeMockPackage({ status: 'DRAFT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new UnpublishPackageUseCase(repo, aiSyncTaskService as any);
    await expect(uc.execute('pkg-1', adminActor)).rejects.toThrow('Cannot transition');
  });
});

// ============================================================================
// ListPackagesUseCase
// ============================================================================
describe('ListPackagesUseCase', () => {
  let repo: IPackageRepository;

  beforeEach(() => {
    repo = createMockPackageRepo();
  });

  it('admin sees all packages', async () => {
    const packages = [makeMockPackage()];
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: packages, total: 1 });

    const uc = new ListPackagesUseCase(repo);
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    // Admin query should not force status filter
    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('patient sees only PUBLISHED packages', async () => {
    const packages = [makeMockPackage({ status: 'PUBLISHED' })];
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: packages, total: 1 });

    const uc = new ListPackagesUseCase(repo);
    await uc.execute({ page: 1, limit: 20 }, patientActor);

    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'PUBLISHED' });
  });
});

// ============================================================================
// GetPackageUseCase
// ============================================================================
describe('GetPackageUseCase', () => {
  let repo: IPackageRepository;

  beforeEach(() => {
    repo = createMockPackageRepo();
  });

  it('returns package for admin', async () => {
    const pkg = makeMockPackage({ status: 'DRAFT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new GetPackageUseCase(repo);
    const result = await uc.execute('pkg-1', adminActor);

    expect(result.id).toBe('pkg-1');
    expect(result.status).toBe('DRAFT');
  });

  it('returns PUBLISHED package for patient', async () => {
    const pkg = makeMockPackage({ status: 'PUBLISHED' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new GetPackageUseCase(repo);
    const result = await uc.execute('pkg-1', patientActor);

    expect(result.id).toBe('pkg-1');
  });

  it('throws ForbiddenError for patient on DRAFT package', async () => {
    const pkg = makeMockPackage({ status: 'DRAFT' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const uc = new GetPackageUseCase(repo);
    await expect(uc.execute('pkg-1', patientActor)).rejects.toThrow('Package not available');
  });

  it('throws NotFoundError for missing package', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const uc = new GetPackageUseCase(repo);
    await expect(uc.execute('nope', adminActor)).rejects.toThrow('not found');
  });
});
