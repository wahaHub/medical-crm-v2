import type { IPackageRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { PackageDTO } from '../../dtos/package.dto.js';
import type { Actor } from '../../types/actor.js';
import { toPackageDTO } from '../../mappers/package.mapper.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export class PublishPackageUseCase {
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

    entity.publish();

    const saved = await this.packageRepo.save(entity);
    await this.aiSyncTaskService.enqueuePackageUpsert({
      packageId: saved.id,
      nameEn: saved.nameEn,
      nameZh: saved.nameZh,
      packageType: saved.type,
      price: saved.price,
      currency: saved.currency,
      descriptionEn: saved.descriptionEn,
      descriptionZh: saved.descriptionZh,
      inclusions: saved.inclusions,
      status: saved.status,
    });
    return toPackageDTO(saved);
  }
}
