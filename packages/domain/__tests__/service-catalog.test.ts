import { describe, it, expect } from 'vitest';
import { ServiceCatalogItem } from '../src/entities/service-catalog-item.entity.js';
import { QuoteTemplate } from '../src/entities/quote-template.entity.js';

// ——— Factories ———
function createTestItem(overrides: Partial<ConstructorParameters<typeof ServiceCatalogItem>[0]> = {}) {
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
    inclusions: { items: ['consultation', 'anesthesia'] },
    isPublic: false,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function createTestTemplate(overrides: Partial<ConstructorParameters<typeof QuoteTemplate>[0]> = {}) {
  return new QuoteTemplate({
    id: 'qt-1',
    hospitalId: 'hosp-1',
    name: 'Cosmetic Surgery Quote',
    conditionCategory: 'COSMETIC_SURGERY',
    lineItemsTemplate: [
      { label: 'Surgery fee', type: 'fixed' },
      { label: 'Hospital stay', type: 'per_day' },
    ],
    defaultValidDays: 30,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

// ============================================================================
// ServiceCatalogItem entity
// ============================================================================
describe('ServiceCatalogItem entity', () => {
  describe('constructor', () => {
    it('creates an item with all fields', () => {
      const item = createTestItem();
      expect(item.id).toBe('sci-1');
      expect(item.hospitalId).toBe('hosp-1');
      expect(item.nameEn).toBe('Rhinoplasty');
      expect(item.nameZh).toBe('鼻整形');
      expect(item.category).toBe('COSMETIC_SURGERY');
      expect(item.priceMin).toBe('3000.00');
      expect(item.priceMax).toBe('8000.00');
      expect(item.currency).toBe('USD');
      expect(item.estimatedStayDays).toBe(3);
      expect(item.estimatedRecoveryDays).toBe(14);
      expect(item.inclusions).toEqual({ items: ['consultation', 'anesthesia'] });
      expect(item.isPublic).toBe(false);
      expect(item.isActive).toBe(true);
    });

    it('handles null optional fields', () => {
      const item = createTestItem({
        nameZh: null,
        estimatedStayDays: null,
        estimatedRecoveryDays: null,
        inclusions: null,
      });
      expect(item.nameZh).toBeNull();
      expect(item.estimatedStayDays).toBeNull();
      expect(item.estimatedRecoveryDays).toBeNull();
      expect(item.inclusions).toBeNull();
    });
  });

  describe('update', () => {
    it('updates provided fields', () => {
      const item = createTestItem();
      const before = item.updatedAt;
      item.update({
        nameEn: 'Facelift',
        priceMin: '5000.00',
        priceMax: '12000.00',
        isPublic: true,
      });
      expect(item.nameEn).toBe('Facelift');
      expect(item.priceMin).toBe('5000.00');
      expect(item.priceMax).toBe('12000.00');
      expect(item.isPublic).toBe(true);
      expect(item.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not change fields that are not provided', () => {
      const item = createTestItem();
      item.update({ nameEn: 'Updated' });
      expect(item.nameZh).toBe('鼻整形');
      expect(item.category).toBe('COSMETIC_SURGERY');
      expect(item.priceMin).toBe('3000.00');
    });

    it('updates category', () => {
      const item = createTestItem();
      item.update({ category: 'DENTAL' });
      expect(item.category).toBe('DENTAL');
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', () => {
      const item = createTestItem();
      expect(item.isActive).toBe(true);
      item.deactivate();
      expect(item.isActive).toBe(false);
    });

    it('updates updatedAt', () => {
      const item = createTestItem();
      const before = item.updatedAt;
      item.deactivate();
      expect(item.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// ============================================================================
// QuoteTemplate entity
// ============================================================================
describe('QuoteTemplate entity', () => {
  describe('constructor', () => {
    it('creates a template with all fields', () => {
      const t = createTestTemplate();
      expect(t.id).toBe('qt-1');
      expect(t.hospitalId).toBe('hosp-1');
      expect(t.name).toBe('Cosmetic Surgery Quote');
      expect(t.conditionCategory).toBe('COSMETIC_SURGERY');
      expect(t.lineItemsTemplate).toEqual([
        { label: 'Surgery fee', type: 'fixed' },
        { label: 'Hospital stay', type: 'per_day' },
      ]);
      expect(t.defaultValidDays).toBe(30);
      expect(t.isActive).toBe(true);
    });

    it('handles null conditionCategory', () => {
      const t = createTestTemplate({ conditionCategory: null });
      expect(t.conditionCategory).toBeNull();
    });
  });

  describe('update', () => {
    it('updates provided fields', () => {
      const t = createTestTemplate();
      const before = t.updatedAt;
      t.update({
        name: 'Updated Template',
        defaultValidDays: 60,
      });
      expect(t.name).toBe('Updated Template');
      expect(t.defaultValidDays).toBe(60);
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not change fields that are not provided', () => {
      const t = createTestTemplate();
      t.update({ name: 'New Name' });
      expect(t.conditionCategory).toBe('COSMETIC_SURGERY');
      expect(t.defaultValidDays).toBe(30);
    });

    it('updates lineItemsTemplate', () => {
      const t = createTestTemplate();
      const newItems = [{ label: 'New item', type: 'custom' }];
      t.update({ lineItemsTemplate: newItems });
      expect(t.lineItemsTemplate).toEqual(newItems);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', () => {
      const t = createTestTemplate();
      expect(t.isActive).toBe(true);
      t.deactivate();
      expect(t.isActive).toBe(false);
    });

    it('updates updatedAt', () => {
      const t = createTestTemplate();
      const before = t.updatedAt;
      t.deactivate();
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});
