import { describe, expect, it, vi } from 'vitest';
import type { IMaterialsRepository } from '@medical-crm/domain';
import { RoutingMaterialsRepository } from '../../services/routing-materials.repository.js';

function createRepo(label: string): IMaterialsRepository {
  return {
    getHospitalInfo: vi.fn(async () => ({ id: `${label}-info` } as never)),
    updateHospitalInfo: vi.fn(async () => ({ id: `${label}-info` } as never)),
    listProcedures: vi.fn(async () => []),
    createProcedure: vi.fn(async () => ({ id: `${label}-procedure` } as never)),
    updateProcedure: vi.fn(async () => ({ id: `${label}-procedure` } as never)),
    deleteProcedure: vi.fn(async () => {}),
    listSurgeons: vi.fn(async () => []),
    createSurgeon: vi.fn(async () => ({ id: `${label}-surgeon` } as never)),
    updateSurgeon: vi.fn(async () => ({ id: `${label}-surgeon` } as never)),
    deleteSurgeon: vi.fn(async () => {}),
    listBeforeAfterCases: vi.fn(async () => []),
    createBeforeAfterCase: vi.fn(async () => ({ id: `${label}-case` } as never)),
    updateBeforeAfterCase: vi.fn(async () => ({ id: `${label}-case` } as never)),
    deleteBeforeAfterCase: vi.fn(async () => {}),
    listReviews: vi.fn(async () => [{ id: `${label}-review` }] as never),
    createReview: vi.fn(async () => ({ id: `${label}-review` } as never)),
    updateReview: vi.fn(async () => ({ id: `${label}-review` } as never)),
    deleteReview: vi.fn(async () => {}),
    listPackages: vi.fn(async () => [{ id: `${label}-package` }] as never),
    getPackage: vi.fn(async () => ({ id: `${label}-package` } as never)),
    createPackage: vi.fn(async () => ({ id: `${label}-package` } as never)),
    updatePackage: vi.fn(async () => ({ id: `${label}-package` } as never)),
    deletePackage: vi.fn(async () => {}),
  };
}

describe('RoutingMaterialsRepository review/package routing', () => {
  it('routes reviews and packages through the shared materials repo instead of the hospital-type repo', async () => {
    const cosmeticRepo = createRepo('cosmetic');
    const regularRepo = createRepo('regular');
    const sharedRepo = createRepo('shared');
    const resolveType = vi.fn(async () => 'REGULAR' as const);
    const repo = new RoutingMaterialsRepository(cosmeticRepo, regularRepo, sharedRepo, resolveType);

    const reviews = await repo.listReviews('hospital-1');
    const packages = await repo.listPackages('hospital-1');

    expect(reviews).toEqual([{ id: 'shared-review' }]);
    expect(packages).toEqual([{ id: 'shared-package' }]);
    expect(sharedRepo.listReviews).toHaveBeenCalledWith('hospital-1');
    expect(sharedRepo.listPackages).toHaveBeenCalledWith('hospital-1');
    expect(regularRepo.listReviews).not.toHaveBeenCalled();
    expect(regularRepo.listPackages).not.toHaveBeenCalled();
  });
});
