import type { ServiceCatalogItem } from '../entities/service-catalog-item.entity.js';
import type { QuoteTemplate } from '../entities/quote-template.entity.js';

export interface ServiceCatalogListQuery {
  hospitalId?: string;
  category?: string;
  isPublic?: boolean;
  isActive?: boolean;
  page: number;
  limit: number;
}

export interface QuoteTemplateListQuery {
  hospitalId?: string;
  conditionCategory?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export interface IServiceCatalogRepository {
  // Service Catalog Items
  findItemById(id: string): Promise<ServiceCatalogItem | null>;
  findItemsByHospitalId(hospitalId: string, query: ServiceCatalogListQuery): Promise<{ data: ServiceCatalogItem[]; total: number }>;
  findAllItems(query: ServiceCatalogListQuery): Promise<{ data: ServiceCatalogItem[]; total: number }>;
  saveItem(entity: ServiceCatalogItem): Promise<ServiceCatalogItem>;

  // Quote Templates
  findTemplateById(id: string): Promise<QuoteTemplate | null>;
  findTemplatesByHospitalId(hospitalId: string, query: QuoteTemplateListQuery): Promise<{ data: QuoteTemplate[]; total: number }>;
  saveTemplate(entity: QuoteTemplate): Promise<QuoteTemplate>;
}
