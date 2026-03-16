import type { ServiceCatalogItem, QuoteTemplate } from '@medical-crm/domain';
import type { ServiceCatalogItemDTO, QuoteTemplateDTO } from '../dtos/service-catalog.dto.js';

export function toServiceCatalogItemDTO(entity: ServiceCatalogItem): ServiceCatalogItemDTO {
  return {
    id: entity.id,
    hospitalId: entity.hospitalId,
    nameEn: entity.nameEn,
    nameZh: entity.nameZh,
    category: entity.category,
    priceMin: entity.priceMin,
    priceMax: entity.priceMax,
    currency: entity.currency,
    estimatedStayDays: entity.estimatedStayDays,
    estimatedRecoveryDays: entity.estimatedRecoveryDays,
    inclusions: entity.inclusions,
    isPublic: entity.isPublic,
    isActive: entity.isActive,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toQuoteTemplateDTO(entity: QuoteTemplate): QuoteTemplateDTO {
  return {
    id: entity.id,
    hospitalId: entity.hospitalId,
    name: entity.name,
    conditionCategory: entity.conditionCategory,
    lineItemsTemplate: entity.lineItemsTemplate,
    defaultValidDays: entity.defaultValidDays,
    isActive: entity.isActive,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
