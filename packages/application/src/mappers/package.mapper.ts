import type { Package } from '@medical-crm/domain';
import type { PackageDTO } from '../dtos/package.dto.js';

export function toPackageDTO(entity: Package): PackageDTO {
  return {
    id: entity.id,
    nameEn: entity.nameEn,
    nameZh: entity.nameZh,
    type: entity.type,
    price: entity.price,
    currency: entity.currency,
    descriptionEn: entity.descriptionEn,
    descriptionZh: entity.descriptionZh,
    inclusions: entity.inclusions,
    coverImageUrl: entity.coverImageUrl,
    sortWeight: entity.sortWeight,
    status: entity.status,
    publishAt: entity.publishAt?.toISOString() ?? null,
    takedownAt: entity.takedownAt?.toISOString() ?? null,
    config: entity.config,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
