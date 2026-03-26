import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapAiSyncUseCase } from './bootstrap-ai-sync.use-case.js';
import type { Actor } from '../../types/actor.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

describe('BootstrapAiSyncUseCase', () => {
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

  let faqRepo: ReturnType<typeof createMockFaqRepo>;
  let packageRepo: ReturnType<typeof createMockPackageRepo>;
  let aiSyncTaskService: MockAiSyncTaskService;

  beforeEach(() => {
    faqRepo = createMockFaqRepo();
    packageRepo = createMockPackageRepo();
    aiSyncTaskService = createMockAiSyncTaskService();
  });

  it('rejects non-admin actors', async () => {
    const useCase = new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService as unknown as AiSyncTaskService);

    await expect(useCase.execute(patientActor)).rejects.toThrow('Admin only');
  });

  it('enqueues FAQ sync for both hospital types, paginates through all pages, and only queries global active FAQs', async () => {
    const useCase = new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService as unknown as AiSyncTaskService);

    faqRepo.findAll.mockImplementation((query: { page: number; hospitalType?: string }) => {
      if (query.hospitalType === 'COSMETIC' && query.page === 1) {
        return Promise.resolve({ data: buildFaqPage('cosmetic', 100), total: 101 });
      }
      if (query.hospitalType === 'COSMETIC' && query.page === 2) {
        return Promise.resolve({ data: buildFaqPage('cosmetic', 1, 101), total: 101 });
      }
      if (query.hospitalType === 'REGULAR' && query.page === 1) {
        return Promise.resolve({ data: buildFaqPage('regular', 100), total: 101 });
      }
      if (query.hospitalType === 'REGULAR' && query.page === 2) {
        return Promise.resolve({ data: buildFaqPage('regular', 1, 101), total: 101 });
      }
      throw new Error(`Unexpected FAQ query: ${JSON.stringify(query)}`);
    });

    packageRepo.findAll.mockImplementation(() => Promise.resolve({ data: [], total: 0 }));

    const result = await useCase.execute(adminActor);

    expect(result.faqEnqueued).toBe(202);
    expect(result.packageEnqueued).toBe(0);
    expect(faqRepo.findAll).toHaveBeenCalledTimes(4);
    expect(faqRepo.findAll).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 100,
      hospitalType: 'COSMETIC',
      hospitalId: null,
      isActive: true,
    });
    expect(faqRepo.findAll).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 100,
      hospitalType: 'COSMETIC',
      hospitalId: null,
      isActive: true,
    });
    expect(faqRepo.findAll).toHaveBeenNthCalledWith(3, {
      page: 1,
      limit: 100,
      hospitalType: 'REGULAR',
      hospitalId: null,
      isActive: true,
    });
    expect(faqRepo.findAll).toHaveBeenNthCalledWith(4, {
      page: 2,
      limit: 100,
      hospitalType: 'REGULAR',
      hospitalId: null,
      isActive: true,
    });
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenCalledTimes(202);
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        faqId: 'cosmetic-faq-1',
        hospitalType: 'COSMETIC',
        hospitalId: null,
        isActive: true,
      }),
    );
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(
      101,
      expect.objectContaining({
        faqId: 'cosmetic-faq-101',
        hospitalType: 'COSMETIC',
        hospitalId: null,
        isActive: true,
      }),
    );
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(
      102,
      expect.objectContaining({
        faqId: 'regular-faq-1',
        hospitalType: 'REGULAR',
        hospitalId: null,
        isActive: true,
      }),
    );
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenNthCalledWith(
      202,
      expect.objectContaining({
        faqId: 'regular-faq-101',
        hospitalType: 'REGULAR',
        hospitalId: null,
        isActive: true,
      }),
    );
    expect(aiSyncTaskService.enqueuePackageUpsert).not.toHaveBeenCalled();
  });

  it('queries only published packages, paginates through all pages, and returns the matching summary totals', async () => {
    const useCase = new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService as unknown as AiSyncTaskService);

    faqRepo.findAll.mockImplementation(() => Promise.resolve({ data: [], total: 0 }));
    packageRepo.findAll.mockImplementation((query: { page: number; status?: string }) => {
      if (query.status !== 'PUBLISHED') {
        throw new Error(`Unexpected package status query: ${JSON.stringify(query)}`);
      }
      if (query.page === 1) {
        return Promise.resolve({ data: buildPackagePage(100), total: 101 });
      }
      if (query.page === 2) {
        return Promise.resolve({ data: buildPackagePage(1, 101), total: 101 });
      }
      throw new Error(`Unexpected package query: ${JSON.stringify(query)}`);
    });

    const result = await useCase.execute(adminActor);

    expect(result.faqEnqueued).toBe(0);
    expect(result.packageEnqueued).toBe(101);
    expect(packageRepo.findAll).toHaveBeenCalledTimes(2);
    expect(packageRepo.findAll).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 100,
      status: 'PUBLISHED',
    });
    expect(packageRepo.findAll).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 100,
      status: 'PUBLISHED',
    });
    expect(aiSyncTaskService.enqueuePackageUpsert).toHaveBeenCalledTimes(101);
    expect(aiSyncTaskService.enqueuePackageUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        packageId: 'package-1',
        status: 'PUBLISHED',
      }),
    );
    expect(aiSyncTaskService.enqueuePackageUpsert).toHaveBeenNthCalledWith(
      101,
      expect.objectContaining({
        packageId: 'package-101',
        status: 'PUBLISHED',
      }),
    );
  });

  it('returns summary totals that match the actual combined FAQ and package enqueues in one execution', async () => {
    const useCase = new BootstrapAiSyncUseCase(faqRepo, packageRepo, aiSyncTaskService as unknown as AiSyncTaskService);

    faqRepo.findAll.mockImplementation((query: { page: number; hospitalType?: string }) => {
      if (query.hospitalType === 'COSMETIC' && query.page === 1) {
        return Promise.resolve({ data: buildFaqPage('cosmetic', 2), total: 2 });
      }
      if (query.hospitalType === 'REGULAR' && query.page === 1) {
        return Promise.resolve({ data: buildFaqPage('regular', 1), total: 1 });
      }
      throw new Error(`Unexpected FAQ query: ${JSON.stringify(query)}`);
    });

    packageRepo.findAll.mockImplementation((query: { page: number; status?: string }) => {
      if (query.status !== 'PUBLISHED') {
        throw new Error(`Unexpected package status query: ${JSON.stringify(query)}`);
      }
      if (query.page === 1) {
        return Promise.resolve({ data: buildPackagePage(2), total: 2 });
      }
      throw new Error(`Unexpected package query: ${JSON.stringify(query)}`);
    });

    const result = await useCase.execute(adminActor);

    expect(result).toEqual({ faqEnqueued: 3, packageEnqueued: 2 });
    expect(aiSyncTaskService.enqueueFaqUpsert).toHaveBeenCalledTimes(3);
    expect(aiSyncTaskService.enqueuePackageUpsert).toHaveBeenCalledTimes(2);
    expect(
      aiSyncTaskService.enqueueFaqUpsert.mock.calls.map(([payload]) => (payload as { faqId: string }).faqId),
    ).toEqual(['cosmetic-faq-1', 'cosmetic-faq-2', 'regular-faq-1']);
    expect(
      aiSyncTaskService.enqueuePackageUpsert.mock.calls.map(([payload]) => (payload as { packageId: string }).packageId),
    ).toEqual(['package-1', 'package-2']);
  });
});

function createMockFaqRepo() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    listCategories: vi.fn(),
    findCategoryById: vi.fn(),
    createCategory: vi.fn(),
    countItemsForCategory: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    deleteCategory: vi.fn(),
  };
}

function createMockPackageRepo() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

type MockAiSyncTaskService = {
  enqueueFaqUpsert: ReturnType<typeof vi.fn>;
  enqueueFaqDelete: ReturnType<typeof vi.fn>;
  enqueuePackageUpsert: ReturnType<typeof vi.fn>;
  enqueuePackageDelete: ReturnType<typeof vi.fn>;
};

function createMockAiSyncTaskService(): MockAiSyncTaskService {
  return {
    enqueueFaqUpsert: vi.fn(),
    enqueueFaqDelete: vi.fn(),
    enqueuePackageUpsert: vi.fn(),
    enqueuePackageDelete: vi.fn(),
  };
}

function buildFaqPage(prefix: 'cosmetic' | 'regular', count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => {
    const n = start + index;
    return {
      id: `${prefix}-faq-${n}`,
      category: 'General',
      question: `Question ${n}?`,
      answer: `Answer ${n}.`,
      hospitalType: prefix === 'cosmetic' ? 'COSMETIC' : 'REGULAR',
      hospitalId: null,
      keywords: [`keyword-${n}`],
      attachments: [
        {
          fileName: `attachment-${n}.pdf`,
          storageKey: `storage-${n}`,
          mimeType: 'application/pdf',
          fileSize: 1234,
        },
      ],
      isActive: true,
    };
  });
}

function buildPackagePage(count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => {
    const n = start + index;
    return {
      id: `package-${n}`,
      nameEn: `Package ${n}`,
      nameZh: null,
      type: 'HEALTH_CHECKUP',
      price: '100.00',
      currency: 'USD',
      descriptionEn: null,
      descriptionZh: null,
      inclusions: null,
      status: 'PUBLISHED',
    };
  });
}
