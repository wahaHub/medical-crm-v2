import type { IServiceCatalogRepository } from '@medical-crm/domain';
import type { ServiceCatalogItemDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toServiceCatalogItemDTO } from '../../mappers/service-catalog.mapper.js';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';

export class GetServiceCatalogItemUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(id: string, actor: Actor): Promise<ServiceCatalogItemDTO> {
    const item = await this.repo.findItemById(id);
    if (!item) {
      throw new NotFoundError('Service catalog item not found');
    }

    // Hospital can only see own items
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== item.hospitalId) {
      throw new ForbiddenError('Hospital users can only view their own catalog items');
    }

    // Patients can only see public + active items
    if (actor.role === 'PATIENT' && (!item.isPublic || !item.isActive)) {
      throw new NotFoundError('Service catalog item not found');
    }

    return toServiceCatalogItemDTO(item);
  }
}
