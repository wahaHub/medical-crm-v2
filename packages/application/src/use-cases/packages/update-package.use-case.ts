import type { IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';

export interface UpdatePackageInput {
  nameEn?: string;
  nameZh?: string | null;
  type?: string;
  price?: string;
  currency?: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  inclusions?: unknown;
  coverImageUrl?: string | null;
  sortWeight?: number;
  publishAt?: string | null;
  takedownAt?: string | null;
  config?: unknown;
}

export class UpdatePackageUseCase {
  constructor(private readonly packageRepo: IPackageRepository) {}

  async execute(id: string, input: UpdatePackageInput, actor: Actor): Promise<PackageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = await this.packageRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Package ${id} not found`);
    }

    if (entity.status !== 'DRAFT') {
      throw new ValidationError('Can only update DRAFT packages');
    }

    if (input.nameEn !== undefined) entity.nameEn = input.nameEn;
    if (input.nameZh !== undefined) entity.nameZh = input.nameZh;
    if (input.type !== undefined) entity.type = input.type as import('@medical-crm/domain').PackageType;
    if (input.price !== undefined) entity.price = input.price;
    if (input.currency !== undefined) entity.currency = input.currency;
    if (input.descriptionEn !== undefined) entity.descriptionEn = input.descriptionEn;
    if (input.descriptionZh !== undefined) entity.descriptionZh = input.descriptionZh;
    if (input.inclusions !== undefined) entity.inclusions = input.inclusions;
    if (input.coverImageUrl !== undefined) entity.coverImageUrl = input.coverImageUrl;
    if (input.sortWeight !== undefined) entity.sortWeight = input.sortWeight;
    if (input.publishAt !== undefined) entity.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    if (input.takedownAt !== undefined) entity.takedownAt = input.takedownAt ? new Date(input.takedownAt) : null;
    if (input.config !== undefined) entity.config = input.config;
    entity.updatedAt = new Date();

    const saved = await this.packageRepo.save(entity);
    return toPackageDTO(saved);
  }
}
