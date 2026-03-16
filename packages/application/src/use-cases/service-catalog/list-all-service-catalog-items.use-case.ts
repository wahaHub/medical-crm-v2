import type { IServiceCatalogRepository, ServiceCatalogListQuery } from '@medical-crm/domain';
import type { ServiceCatalogItemDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toServiceCatalogItemDTO } from '../../mappers/service-catalog.mapper.js';
import { ForbiddenError } from '@medical-crm/utils';

export class ListAllServiceCatalogItemsUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    query: ServiceCatalogListQuery,
    actor: Actor,
  ): Promise<{ data: ServiceCatalogItemDTO[]; total: number; page: number; limit: number }> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const result = await this.repo.findAllItems(query);

    return {
      data: result.data.map((e) => toServiceCatalogItemDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
