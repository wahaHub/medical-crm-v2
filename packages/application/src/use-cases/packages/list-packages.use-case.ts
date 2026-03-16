import type { IPackageRepository, PackageListQuery } from '@medical-crm/domain';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';

export class ListPackagesUseCase {
  constructor(private readonly packageRepo: IPackageRepository) {}

  async execute(
    query: PackageListQuery,
    actor: Actor,
  ): Promise<{ data: PackageDTO[]; total: number; page: number; limit: number }> {
    // Patients can only see PUBLISHED packages
    const effectiveQuery: PackageListQuery = actor.role === 'PATIENT'
      ? { ...query, status: 'PUBLISHED' }
      : query;

    const result = await this.packageRepo.findAll(effectiveQuery);

    return {
      data: result.data.map((e) => toPackageDTO(e)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
