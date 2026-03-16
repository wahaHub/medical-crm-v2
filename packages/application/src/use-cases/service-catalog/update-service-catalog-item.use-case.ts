import type { IServiceCatalogRepository } from '@medical-crm/domain';
import type { ServiceCatalogItemDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toServiceCatalogItemDTO } from '../../mappers/service-catalog.mapper.js';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';

export interface UpdateServiceCatalogItemInput {
  nameEn?: string;
  nameZh?: string | null;
  category?: string;
  priceMin?: string;
  priceMax?: string;
  currency?: string;
  estimatedStayDays?: number | null;
  estimatedRecoveryDays?: number | null;
  inclusions?: unknown;
  isPublic?: boolean;
}

export class UpdateServiceCatalogItemUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    id: string,
    input: UpdateServiceCatalogItemInput,
    actor: Actor,
  ): Promise<ServiceCatalogItemDTO> {
    const item = await this.repo.findItemById(id);
    if (!item) {
      throw new NotFoundError('Service catalog item not found');
    }

    // Hospital can only update own items
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== item.hospitalId) {
      throw new ForbiddenError('Hospital users can only update their own catalog items');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot update service catalog');
    }

    item.update({
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      category: input.category as import('@medical-crm/domain').ServiceCatalogCategory | undefined,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      currency: input.currency,
      estimatedStayDays: input.estimatedStayDays,
      estimatedRecoveryDays: input.estimatedRecoveryDays,
      inclusions: input.inclusions,
      isPublic: input.isPublic,
    });

    const saved = await this.repo.saveItem(item);
    return toServiceCatalogItemDTO(saved);
  }
}
