import type { IServiceCatalogRepository } from '@medical-crm/domain';
import { ServiceCatalogItem } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { ServiceCatalogItemDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toServiceCatalogItemDTO } from '../../mappers/service-catalog.mapper.js';

export interface CreateServiceCatalogItemInput {
  nameEn: string;
  nameZh?: string | null;
  category: string;
  priceMin: string;
  priceMax: string;
  currency?: string;
  estimatedStayDays?: number | null;
  estimatedRecoveryDays?: number | null;
  inclusions?: unknown;
  isPublic?: boolean;
}

export class CreateServiceCatalogItemUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    hospitalId: string,
    input: CreateServiceCatalogItemInput,
    actor: Actor,
  ): Promise<ServiceCatalogItemDTO> {
    // Hospital can only create for own hospital; Admin can create for any
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own catalog');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot manage service catalog');
    }

    const entity = new ServiceCatalogItem({
      id: generateId(),
      hospitalId,
      nameEn: input.nameEn,
      nameZh: input.nameZh ?? null,
      category: input.category as import('@medical-crm/domain').ServiceCatalogCategory,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      currency: input.currency ?? 'USD',
      estimatedStayDays: input.estimatedStayDays ?? null,
      estimatedRecoveryDays: input.estimatedRecoveryDays ?? null,
      inclusions: input.inclusions ?? null,
      isPublic: input.isPublic ?? false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.repo.saveItem(entity);
    return toServiceCatalogItemDTO(saved);
  }
}
