import type { IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export class UnpublishPackageUseCase {
  constructor(
    private readonly packageRepo: IPackageRepository,
    private readonly aiSyncTaskService: AiSyncTaskService,
  ) {}

  async execute(id: string, actor: Actor): Promise<PackageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin only');
    }

    const entity = await this.packageRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Package ${id} not found`);
    }

    entity.unpublish();

    const saved = await this.packageRepo.save(entity);
    await this.aiSyncTaskService.enqueuePackageDelete({
      packageId: saved.id,
    });
    return toPackageDTO(saved);
  }
}
