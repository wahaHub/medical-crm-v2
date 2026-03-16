import type { ServiceCatalogCategory } from '../enums/index.js';

export interface ServiceCatalogItemProps {
  id: string;
  hospitalId: string;
  nameEn: string;
  nameZh: string | null;
  category: ServiceCatalogCategory;
  priceMin: string;  // decimal as string
  priceMax: string;
  currency: string;
  estimatedStayDays: number | null;
  estimatedRecoveryDays: number | null;
  inclusions: unknown | null;
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceCatalogItem {
  readonly id: string;
  readonly hospitalId: string;
  nameEn: string;
  nameZh: string | null;
  category: ServiceCatalogCategory;
  priceMin: string;
  priceMax: string;
  currency: string;
  estimatedStayDays: number | null;
  estimatedRecoveryDays: number | null;
  inclusions: unknown | null;
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ServiceCatalogItemProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.nameEn = props.nameEn;
    this.nameZh = props.nameZh;
    this.category = props.category;
    this.priceMin = props.priceMin;
    this.priceMax = props.priceMax;
    this.currency = props.currency;
    this.estimatedStayDays = props.estimatedStayDays;
    this.estimatedRecoveryDays = props.estimatedRecoveryDays;
    this.inclusions = props.inclusions;
    this.isPublic = props.isPublic;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(data: Partial<Pick<ServiceCatalogItemProps, 'nameEn' | 'nameZh' | 'category' | 'priceMin' | 'priceMax' | 'currency' | 'estimatedStayDays' | 'estimatedRecoveryDays' | 'inclusions' | 'isPublic'>>): void {
    if (data.nameEn !== undefined) this.nameEn = data.nameEn;
    if (data.nameZh !== undefined) this.nameZh = data.nameZh;
    if (data.category !== undefined) this.category = data.category;
    if (data.priceMin !== undefined) this.priceMin = data.priceMin;
    if (data.priceMax !== undefined) this.priceMax = data.priceMax;
    if (data.currency !== undefined) this.currency = data.currency;
    if (data.estimatedStayDays !== undefined) this.estimatedStayDays = data.estimatedStayDays;
    if (data.estimatedRecoveryDays !== undefined) this.estimatedRecoveryDays = data.estimatedRecoveryDays;
    if (data.inclusions !== undefined) this.inclusions = data.inclusions;
    if (data.isPublic !== undefined) this.isPublic = data.isPublic;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
