import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetMaterialsPackagesUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
  ) {}

  async execute(
    hospitalId: string,
    actor: Actor,
  ): Promise<Awaited<ReturnType<IMaterialsRepository['listPackages']>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    if (hospitalType !== 'REGULAR') {
      throw new ForbiddenError('Materials packages are only available for regular hospitals');
    }

    return this.materialsRepo.listPackages(hospitalId);
  }
}
