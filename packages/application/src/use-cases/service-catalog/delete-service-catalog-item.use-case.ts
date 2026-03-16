import type { IServiceCatalogRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';

export class DeleteServiceCatalogItemUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    const item = await this.repo.findItemById(id);
    if (!item) {
      throw new NotFoundError('Service catalog item not found');
    }

    // Hospital can only delete own items
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== item.hospitalId) {
      throw new ForbiddenError('Hospital users can only delete their own catalog items');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot delete service catalog items');
    }

    item.deactivate();
    await this.repo.saveItem(item);
  }
}
