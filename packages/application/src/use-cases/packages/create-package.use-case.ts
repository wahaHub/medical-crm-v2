import type { IPackageRepository } from '@medical-crm/domain';
import { Package } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';

export interface CreatePackageInput {
  nameEn: string;
  nameZh?: string;
  type: string;
  price: string;
  currency?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  inclusions?: unknown;
  coverImageUrl?: string;
  sortWeight?: number;
  publishAt?: string;
  takedownAt?: string;
  config?: unknown;
}

export class CreatePackageUseCase {
  constructor(private readonly packageRepo: IPackageRepository) {}

  async execute(input: CreatePackageInput, actor: Actor): Promise<PackageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = new Package({
      id: generateId(),
      nameEn: input.nameEn,
      nameZh: input.nameZh ?? null,
      type: input.type as import('@medical-crm/domain').PackageType,
      price: input.price,
      currency: input.currency ?? 'USD',
      descriptionEn: input.descriptionEn ?? null,
      descriptionZh: input.descriptionZh ?? null,
      inclusions: input.inclusions ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      sortWeight: input.sortWeight ?? 0,
      status: 'DRAFT',
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      takedownAt: input.takedownAt ? new Date(input.takedownAt) : null,
      config: input.config ?? null,
      createdBy: actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.packageRepo.save(entity);
    return toPackageDTO(saved);
  }
}
