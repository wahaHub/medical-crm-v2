import type { IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';

export class GetPackageUseCase {
  constructor(private readonly packageRepo: IPackageRepository) {}

  async execute(id: string, actor: Actor): Promise<PackageDTO> {
    const entity = await this.packageRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Package ${id} not found`);
    }

    // Patients can only see PUBLISHED packages
    if (actor.role === 'PATIENT' && entity.status !== 'PUBLISHED') {
      throw new ForbiddenError('Package not available');
    }

    return toPackageDTO(entity);
  }
}
