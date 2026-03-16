import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetHospitalInfoUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, actor: Actor): Promise<MaterialsHospitalInfo> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const info = await this.materialsRepo.getHospitalInfo(hospitalId);
    if (!info) {
      throw new NotFoundError(`Hospital ${hospitalId} not found`);
    }

    return info;
  }
}
