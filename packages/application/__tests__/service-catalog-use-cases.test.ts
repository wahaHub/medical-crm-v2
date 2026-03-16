import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateServiceCatalogItemUseCase } from '../src/use-cases/service-catalog/create-service-catalog-item.use-case.js';
import { ListServiceCatalogItemsUseCase } from '../src/use-cases/service-catalog/list-service-catalog-items.use-case.js';
import { GetServiceCatalogItemUseCase } from '../src/use-cases/service-catalog/get-service-catalog-item.use-case.js';
import { UpdateServiceCatalogItemUseCase } from '../src/use-cases/service-catalog/update-service-catalog-item.use-case.js';
import { DeleteServiceCatalogItemUseCase } from '../src/use-cases/service-catalog/delete-service-catalog-item.use-case.js';
import { ListAllServiceCatalogItemsUseCase } from '../src/use-cases/service-catalog/list-all-service-catalog-items.use-case.js';
import { CreateQuoteTemplateUseCase } from '../src/use-cases/service-catalog/create-quote-template.use-case.js';
import { ListQuoteTemplatesUseCase } from '../src/use-cases/service-catalog/list-quote-templates.use-case.js';
import { GetQuoteTemplateUseCase } from '../src/use-cases/service-catalog/get-quote-template.use-case.js';
import { UpdateQuoteTemplateUseCase } from '../src/use-cases/service-catalog/update-quote-template.use-case.js';
import { DeleteQuoteTemplateUseCase } from '../src/use-cases/service-catalog/delete-quote-template.use-case.js';
import type { IServiceCatalogRepository } from '@medical-crm/domain';
import { ServiceCatalogItem, QuoteTemplate } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ——— Actors ———
const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hosp-user-1',
  email: 'hospital@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

const otherHospitalActor: Actor = {
  userId: 'hosp-user-2',
  email: 'other@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-2',
};

const patientActor: Actor = {
  userId: 'patient-1',
  email: 'patient@test.com',
  role: 'PATIENT',
  hospitalId: null,
};

// ——— Factories ———
function makeMockItem(overrides: Partial<ConstructorParameters<typeof ServiceCatalogItem>[0]> = {}): ServiceCatalogItem {
  return new ServiceCatalogItem({
    id: 'sci-1',
    hospitalId: 'hosp-1',
    nameEn: 'Rhinoplasty',
    nameZh: '鼻整形',
    category: 'COSMETIC_SURGERY',
    priceMin: '3000.00',
    priceMax: '8000.00',
    currency: 'USD',
    estimatedStayDays: 3,
    estimatedRecoveryDays: 14,
    inclusions: null,
    isPublic: false,
    isActive: true,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function makeMockTemplate(overrides: Partial<ConstructorParameters<typeof QuoteTemplate>[0]> = {}): QuoteTemplate {
  return new QuoteTemplate({
    id: 'qt-1',
    hospitalId: 'hosp-1',
    name: 'Cosmetic Quote',
    conditionCategory: 'COSMETIC_SURGERY',
    lineItemsTemplate: [{ label: 'Surgery', type: 'fixed' }],
    defaultValidDays: 30,
    isActive: true,
    createdAt: new Date('2026-03-16'),
    updatedAt: new Date('2026-03-16'),
    ...overrides,
  });
}

function createMockRepo(): IServiceCatalogRepository {
  return {
    findItemById: vi.fn(),
    findItemsByHospitalId: vi.fn(),
    findAllItems: vi.fn(),
    saveItem: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    findTemplateById: vi.fn(),
    findTemplatesByHospitalId: vi.fn(),
    saveTemplate: vi.fn().mockImplementation((e) => Promise.resolve(e)),
  };
}

// ============================================================================
// CreateServiceCatalogItemUseCase
// ============================================================================
describe('CreateServiceCatalogItemUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('creates an item as admin', async () => {
    const uc = new CreateServiceCatalogItemUseCase(repo);
    const result = await uc.execute('hosp-1', {
      nameEn: 'Rhinoplasty',
      category: 'COSMETIC_SURGERY',
      priceMin: '3000.00',
      priceMax: '8000.00',
    }, adminActor);

    expect(result.nameEn).toBe('Rhinoplasty');
    expect(result.category).toBe('COSMETIC_SURGERY');
    expect(result.hospitalId).toBe('hosp-1');
    expect(repo.saveItem).toHaveBeenCalledOnce();
  });

  it('creates an item as hospital user for own hospital', async () => {
    const uc = new CreateServiceCatalogItemUseCase(repo);
    const result = await uc.execute('hosp-1', {
      nameEn: 'Facelift',
      category: 'COSMETIC_SURGERY',
      priceMin: '5000.00',
      priceMax: '12000.00',
    }, hospitalActor);

    expect(result.nameEn).toBe('Facelift');
  });

  it('throws ForbiddenError for hospital user creating for other hospital', async () => {
    const uc = new CreateServiceCatalogItemUseCase(repo);
    await expect(uc.execute('hosp-2', {
      nameEn: 'Test',
      category: 'DENTAL',
      priceMin: '100.00',
      priceMax: '200.00',
    }, hospitalActor)).rejects.toThrow('Hospital users can only manage their own catalog');
  });

  it('throws ForbiddenError for patient', async () => {
    const uc = new CreateServiceCatalogItemUseCase(repo);
    await expect(uc.execute('hosp-1', {
      nameEn: 'Test',
      category: 'DENTAL',
      priceMin: '100.00',
      priceMax: '200.00',
    }, patientActor)).rejects.toThrow('Patients cannot manage service catalog');
  });
});

// ============================================================================
// ListServiceCatalogItemsUseCase
// ============================================================================
describe('ListServiceCatalogItemsUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('lists items for admin', async () => {
    (repo.findItemsByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeMockItem()],
      total: 1,
    });

    const uc = new ListServiceCatalogItemsUseCase(repo);
    const result = await uc.execute('hosp-1', { page: 1, limit: 20 }, adminActor);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('hospital user can only list own hospital', async () => {
    const uc = new ListServiceCatalogItemsUseCase(repo);
    await expect(uc.execute('hosp-2', { page: 1, limit: 20 }, hospitalActor))
      .rejects.toThrow('Hospital users can only view their own catalog');
  });

  it('patients see only public + active items', async () => {
    (repo.findItemsByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      total: 0,
    });

    const uc = new ListServiceCatalogItemsUseCase(repo);
    await uc.execute('hosp-1', { page: 1, limit: 20 }, patientActor);

    expect(repo.findItemsByHospitalId).toHaveBeenCalledWith('hosp-1', {
      page: 1,
      limit: 20,
      isPublic: true,
      isActive: true,
    });
  });
});

// ============================================================================
// GetServiceCatalogItemUseCase
// ============================================================================
describe('GetServiceCatalogItemUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('returns item for admin', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new GetServiceCatalogItemUseCase(repo);
    const result = await uc.execute('sci-1', adminActor);
    expect(result.id).toBe('sci-1');
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new GetServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-404', adminActor)).rejects.toThrow('Service catalog item not found');
  });

  it('hospital user cannot get items from other hospital', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new GetServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-1', otherHospitalActor)).rejects.toThrow('Hospital users can only view their own catalog items');
  });

  it('patient cannot see non-public items', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem({ isPublic: false }));
    const uc = new GetServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-1', patientActor)).rejects.toThrow('Service catalog item not found');
  });

  it('patient can see public + active items', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem({ isPublic: true, isActive: true }));
    const uc = new GetServiceCatalogItemUseCase(repo);
    const result = await uc.execute('sci-1', patientActor);
    expect(result.id).toBe('sci-1');
  });
});

// ============================================================================
// UpdateServiceCatalogItemUseCase
// ============================================================================
describe('UpdateServiceCatalogItemUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('updates item as admin', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new UpdateServiceCatalogItemUseCase(repo);
    const result = await uc.execute('sci-1', { nameEn: 'Updated' }, adminActor);
    expect(result.nameEn).toBe('Updated');
    expect(repo.saveItem).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new UpdateServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-404', { nameEn: 'X' }, adminActor)).rejects.toThrow('Service catalog item not found');
  });

  it('hospital user cannot update other hospital items', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new UpdateServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-1', { nameEn: 'X' }, otherHospitalActor)).rejects.toThrow('Hospital users can only update their own catalog items');
  });

  it('patient cannot update items', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new UpdateServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-1', { nameEn: 'X' }, patientActor)).rejects.toThrow('Patients cannot update service catalog');
  });
});

// ============================================================================
// DeleteServiceCatalogItemUseCase
// ============================================================================
describe('DeleteServiceCatalogItemUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('soft-deletes item as admin', async () => {
    const item = makeMockItem();
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    const uc = new DeleteServiceCatalogItemUseCase(repo);
    await uc.execute('sci-1', adminActor);
    expect(item.isActive).toBe(false);
    expect(repo.saveItem).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new DeleteServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-404', adminActor)).rejects.toThrow('Service catalog item not found');
  });

  it('patient cannot delete items', async () => {
    (repo.findItemById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockItem());
    const uc = new DeleteServiceCatalogItemUseCase(repo);
    await expect(uc.execute('sci-1', patientActor)).rejects.toThrow('Patients cannot delete service catalog items');
  });
});

// ============================================================================
// ListAllServiceCatalogItemsUseCase
// ============================================================================
describe('ListAllServiceCatalogItemsUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('lists all items for admin', async () => {
    (repo.findAllItems as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeMockItem()],
      total: 1,
    });

    const uc = new ListAllServiceCatalogItemsUseCase(repo);
    const result = await uc.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.data).toHaveLength(1);
  });

  it('throws ForbiddenError for non-admin', async () => {
    const uc = new ListAllServiceCatalogItemsUseCase(repo);
    await expect(uc.execute({ page: 1, limit: 20 }, hospitalActor)).rejects.toThrow('Admin only');
  });
});

// ============================================================================
// CreateQuoteTemplateUseCase
// ============================================================================
describe('CreateQuoteTemplateUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('creates a template as admin', async () => {
    const uc = new CreateQuoteTemplateUseCase(repo);
    const result = await uc.execute('hosp-1', {
      name: 'Test Template',
      lineItemsTemplate: [{ label: 'Fee', type: 'fixed' }],
    }, adminActor);

    expect(result.name).toBe('Test Template');
    expect(result.hospitalId).toBe('hosp-1');
    expect(repo.saveTemplate).toHaveBeenCalledOnce();
  });

  it('hospital user creates for own hospital', async () => {
    const uc = new CreateQuoteTemplateUseCase(repo);
    const result = await uc.execute('hosp-1', {
      name: 'My Template',
      lineItemsTemplate: [],
    }, hospitalActor);
    expect(result.name).toBe('My Template');
  });

  it('hospital user cannot create for other hospital', async () => {
    const uc = new CreateQuoteTemplateUseCase(repo);
    await expect(uc.execute('hosp-2', {
      name: 'Test',
      lineItemsTemplate: [],
    }, hospitalActor)).rejects.toThrow('Hospital users can only manage their own templates');
  });

  it('patient cannot create templates', async () => {
    const uc = new CreateQuoteTemplateUseCase(repo);
    await expect(uc.execute('hosp-1', {
      name: 'Test',
      lineItemsTemplate: [],
    }, patientActor)).rejects.toThrow('Patients cannot manage quote templates');
  });
});

// ============================================================================
// ListQuoteTemplatesUseCase
// ============================================================================
describe('ListQuoteTemplatesUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('lists templates for admin', async () => {
    (repo.findTemplatesByHospitalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeMockTemplate()],
      total: 1,
    });

    const uc = new ListQuoteTemplatesUseCase(repo);
    const result = await uc.execute('hosp-1', { page: 1, limit: 20 }, adminActor);
    expect(result.data).toHaveLength(1);
  });

  it('hospital user cannot list other hospital templates', async () => {
    const uc = new ListQuoteTemplatesUseCase(repo);
    await expect(uc.execute('hosp-2', { page: 1, limit: 20 }, hospitalActor))
      .rejects.toThrow('Hospital users can only view their own templates');
  });

  it('patient cannot list templates', async () => {
    const uc = new ListQuoteTemplatesUseCase(repo);
    await expect(uc.execute('hosp-1', { page: 1, limit: 20 }, patientActor))
      .rejects.toThrow('Patients cannot view quote templates');
  });
});

// ============================================================================
// GetQuoteTemplateUseCase
// ============================================================================
describe('GetQuoteTemplateUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('returns template for admin', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new GetQuoteTemplateUseCase(repo);
    const result = await uc.execute('qt-1', adminActor);
    expect(result.id).toBe('qt-1');
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new GetQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-404', adminActor)).rejects.toThrow('Quote template not found');
  });

  it('hospital user cannot get other hospital templates', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new GetQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-1', otherHospitalActor)).rejects.toThrow('Hospital users can only view their own templates');
  });

  it('patient cannot get templates', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new GetQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-1', patientActor)).rejects.toThrow('Patients cannot view quote templates');
  });
});

// ============================================================================
// UpdateQuoteTemplateUseCase
// ============================================================================
describe('UpdateQuoteTemplateUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('updates template as admin', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new UpdateQuoteTemplateUseCase(repo);
    const result = await uc.execute('qt-1', { name: 'Updated' }, adminActor);
    expect(result.name).toBe('Updated');
    expect(repo.saveTemplate).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new UpdateQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-404', { name: 'X' }, adminActor)).rejects.toThrow('Quote template not found');
  });

  it('hospital user cannot update other hospital templates', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new UpdateQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-1', { name: 'X' }, otherHospitalActor))
      .rejects.toThrow('Hospital users can only update their own templates');
  });

  it('patient cannot update templates', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new UpdateQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-1', { name: 'X' }, patientActor))
      .rejects.toThrow('Patients cannot update quote templates');
  });
});

// ============================================================================
// DeleteQuoteTemplateUseCase
// ============================================================================
describe('DeleteQuoteTemplateUseCase', () => {
  let repo: IServiceCatalogRepository;

  beforeEach(() => { repo = createMockRepo(); });

  it('soft-deletes template as admin', async () => {
    const tmpl = makeMockTemplate();
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(tmpl);
    const uc = new DeleteQuoteTemplateUseCase(repo);
    await uc.execute('qt-1', adminActor);
    expect(tmpl.isActive).toBe(false);
    expect(repo.saveTemplate).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when not found', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new DeleteQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-404', adminActor)).rejects.toThrow('Quote template not found');
  });

  it('patient cannot delete templates', async () => {
    (repo.findTemplateById as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTemplate());
    const uc = new DeleteQuoteTemplateUseCase(repo);
    await expect(uc.execute('qt-1', patientActor)).rejects.toThrow('Patients cannot delete quote templates');
  });
});
