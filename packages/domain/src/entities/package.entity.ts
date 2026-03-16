import type { PackageType, PackageStatus } from '../enums/index.js';
import { ValidationError } from '@medical-crm/utils';
import { PACKAGE_STATUS_TRANSITIONS } from '../state-machine/package-status-transitions.js';

export interface PackageProps {
  id: string;
  nameEn: string;
  nameZh: string | null;
  type: PackageType;
  price: string;  // decimal as string
  currency: string;
  descriptionEn: string | null;
  descriptionZh: string | null;
  inclusions: unknown | null;
  coverImageUrl: string | null;
  sortWeight: number;
  status: PackageStatus;
  publishAt: Date | null;
  takedownAt: Date | null;
  config: unknown | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Package {
  readonly id: string;
  nameEn: string;
  nameZh: string | null;
  type: PackageType;
  price: string;
  currency: string;
  descriptionEn: string | null;
  descriptionZh: string | null;
  inclusions: unknown | null;
  coverImageUrl: string | null;
  sortWeight: number;
  status: PackageStatus;
  publishAt: Date | null;
  takedownAt: Date | null;
  config: unknown | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: PackageProps) {
    this.id = props.id;
    this.nameEn = props.nameEn;
    this.nameZh = props.nameZh;
    this.type = props.type;
    this.price = props.price;
    this.currency = props.currency;
    this.descriptionEn = props.descriptionEn;
    this.descriptionZh = props.descriptionZh;
    this.inclusions = props.inclusions;
    this.coverImageUrl = props.coverImageUrl;
    this.sortWeight = props.sortWeight;
    this.status = props.status;
    this.publishAt = props.publishAt;
    this.takedownAt = props.takedownAt;
    this.config = props.config;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transitionStatus(to: PackageStatus): void {
    const allowed = PACKAGE_STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition package status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  publish(): void {
    this.transitionStatus('PUBLISHED');
  }

  unpublish(): void {
    this.transitionStatus('DRAFT');
  }
}
