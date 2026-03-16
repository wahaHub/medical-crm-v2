export interface ServiceCatalogItemDTO {
  id: string;
  hospitalId: string;
  nameEn: string;
  nameZh: string | null;
  category: string;
  priceMin: string;
  priceMax: string;
  currency: string;
  estimatedStayDays: number | null;
  estimatedRecoveryDays: number | null;
  inclusions: unknown;
  isPublic: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTemplateDTO {
  id: string;
  hospitalId: string;
  name: string;
  conditionCategory: string | null;
  lineItemsTemplate: unknown;
  defaultValidDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
