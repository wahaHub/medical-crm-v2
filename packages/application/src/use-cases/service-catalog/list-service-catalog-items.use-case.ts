import type { IServiceCatalogRepository, ServiceCatalogListQuery } from '@medical-crm/domain';
import type { ServiceCatalogItemDTO } from '../../dtos/service-catalog.dto.js';
import type { Actor } from '../../types/actor.js';
import { toServiceCatalogItemDTO } from '../../mappers/service-catalog.mapper.js';
import { ForbiddenError } from '@medical-crm/utils';

export class ListServiceCatalogItemsUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(
    hospitalId: string,
    query: ServiceCatalogListQuery,
    actor: Actor,
  ): Promise<{ data: ServiceCatalogItemDTO[]; total: number; page: number; limit: number }> {
    // Hospital can only list own; Admin can list any hospital
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only view their own catalog');
    }

    // Patients can only see public + active items
    const effectiveQuery: ServiceCatalogListQuery = actor.role === 'PATIENT'
      ? { ...query, isPublic: true, isActive: true }
      : query;

    const result = await this.repo.findItemsByHospitalId(hospitalId, effectiveQuery);

    return {
      data: result.data.map((e) => toServiceCatalogItemDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
