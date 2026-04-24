import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetMaterialsReviewsUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
  ) {}

  async execute(
    hospitalId: string,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['listReviews']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    if (hospitalType !== 'REGULAR') {
      throw new ForbiddenError('Materials reviews are only available for regular hospitals');
    }

    return this.materialsRepo.listReviews(hospitalId);
  }
}
