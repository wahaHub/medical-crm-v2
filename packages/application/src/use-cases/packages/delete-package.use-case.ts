import type { IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeletePackageUseCase {
  constructor(private readonly packageRepo: IPackageRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = await this.packageRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Package ${id} not found`);
    }

    await this.packageRepo.delete(id);
  }
}
