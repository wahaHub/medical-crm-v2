import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetMaterialsPackageUseCase {
  constructor(
    private readonly materialsRepo: IMaterialsRepository,
    private readonly resolveHospitalType: (hospitalId: string) => Promise<'COSMETIC' | 'REGULAR'>,
  ) {}

  async execute(
    hospitalId: string,
    packageId: string,
    actor: Actor,
  ): Promise<NonNullable<Awaited<ReturnType<IMaterialsRepository['getPackage']>>>> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const hospitalType = await this.resolveHospitalType(hospitalId);
    if (hospitalType !== 'REGULAR') {
      throw new ForbiddenError('Materials packages are only available for regular hospitals');
    }

    const pkg = await this.materialsRepo.getPackage(packageId, hospitalId);
    if (!pkg) {
      throw new NotFoundError(`Materials package ${packageId} not found for hospital ${hospitalId}`);
    }

    return pkg;
  }
}
